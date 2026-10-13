// Nuru wallet over QR + Firestore — the same protocol JollofSwap uses.
//
// connect_requests/{id}: we write `pending`, show nuru://connect?c={id}; Nuru
//   answers `connected` with aaWallet (the Nuru Account holding funds) and
//   signer (the key that signs), or `rejected`.
// sign_requests/{id}: we write the method + params, show nuru://sign?f={id};
//   Nuru answers `signed` with the result (tx hash / signature) or `rejected`.
//
// Alkebuleum txs are routed through the Nuru Account (AmID contract): the
// primary key calls aaWallet.execute(); a linked key signs a relayed call
// that relay.alkebuleum.com submits gaslessly.
import { ethers } from "ethers";
import { ensureSignedIn, loadRealtimeDb } from "./firebase";
import { RPC_URL, CHAIN_ID } from "./rpc";

const TIMEOUT_MS = 180_000;
const RELAY_URL = "https://relay.alkebuleum.com";
const GAS_PRICE_WEI = 5_000_000_000n;
const EXECUTE_GAS_OVERHEAD = 80_000;
const RELAY_GAS_LIMIT = 8_000_000;

const AMID = new ethers.Interface([
  "function primary() view returns (address)",
  "function signerNonce(address signer) view returns (uint256)",
  "function getRelayedCallHash(address signer, address target, uint256 value, bytes data, uint256 nonce, uint256 deadline) view returns (bytes32)",
  "function execute(address target, uint256 value, bytes data)",
]);

export const nuruConnectUri = (id) => `nuru://connect?c=${id}`;
export const nuruSignUri = (id) => `nuru://sign?f=${id}`;
export const NURU_PLAY_STORE = "https://play.google.com/store/apps/details?id=com.alkebuleum.nuru";

const provider = () => new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
const genId = (prefix = "") => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Writes a pending doc, calls onReady() so the QR can be shown, then resolves
// with the doc's data once `accept` says so.
async function requestAndWait(collectionName, id, pendingData, { accept, rejectMsg, timeoutMsg, onReady }) {
  await ensureSignedIn();
  const { m, db } = await loadRealtimeDb();
  const ref = m.doc(db, collectionName, id);
  await m.setDoc(ref, { status: "pending", ...pendingData, createdAt: m.serverTimestamp() });
  onReady();

  return new Promise((resolve, reject) => {
    let unsub = () => { };
    const timer = setTimeout(() => {
      unsub();
      m.deleteDoc(ref).catch(() => { });
      reject(new Error(timeoutMsg));
    }, TIMEOUT_MS);
    unsub = m.onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (!data) return;
      if (accept(data)) {
        clearTimeout(timer);
        unsub();
        resolve(data);
      } else if (data.status === "rejected") {
        clearTimeout(timer);
        unsub();
        m.deleteDoc(ref).catch(() => { });
        reject(new Error(data.error || rejectMsg));
      }
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// onQr(uri) is called once the request is ready to scan.
export async function nuruConnect(onQr) {
  const id = genId("conn_");
  const d = await requestAndWait("connect_requests", id, {}, {
    accept: (x) => x.status === "connected" && x.aaWallet && x.signer,
    rejectMsg: "Connection rejected in Nuru.",
    timeoutMsg: "Nuru didn't respond in time. Make sure Nuru is open and try again.",
    onReady: () => onQr(nuruConnectUri(id)),
  });
  return {
    type: "nuru",
    address: ethers.getAddress(d.aaWallet),
    signer: ethers.getAddress(d.signer),
    ain: d.ain ? String(d.ain).toUpperCase() : "",
    handle: d.primaryHandle || "",
  };
}

export async function nuruSign(method, params, onQr) {
  const id = genId();
  const d = await requestAndWait("sign_requests", id, { method, params, chainId: CHAIN_ID }, {
    accept: (x) => x.status === "signed" && x.result,
    rejectMsg: "Request rejected in Nuru.",
    timeoutMsg: "Nuru didn't respond in time. Open Nuru and check for a pending approval.",
    onReady: () => onQr(nuruSignUri(id)),
  });
  return d.result;
}

async function waitForReceipt(txHash) {
  const p = provider();
  for (let i = 0; i < 80; i++) {
    const r = await p.getTransactionReceipt(txHash).catch(() => null);
    if (r) {
      if (r.status !== 1) throw new Error("Transaction reverted on chain.");
      return r;
    }
    await sleep(1500);
  }
  throw new Error("Transaction not confirmed yet. Check Nuru for its status.");
}

async function postRelay(path, payload) {
  let res;
  try {
    res = await fetch(`${RELAY_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // A network-level failure here is almost always the relay refusing this
    // site's origin (CORS), not a real outage.
    throw new Error(
      "The Nuru relay didn't accept a request from this site, so payments from a linked Nuru key can't go through here yet. " +
      "Switch Nuru to your primary key, or use the Nuru in-app browser, and try again."
    );
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(`Relay ${path} failed: ${json?.error || json?.rawError || res.statusText}`);
  return json;
}

// Sends {to, data, value} from the connected Nuru Account. Returns the tx hash
// once mined. onQr(uri) fires for each approval Nuru needs.
export async function nuruSendTransaction(conn, { to, data = "0x", value = 0n, gas = 600_000 }, onQr) {
  const p = provider();
  const value_ = BigInt(value);
  const primary = AMID.decodeFunctionResult("primary", await p.call({ to: conn.address, data: AMID.encodeFunctionData("primary") }))[0];

  let txHash;
  if (primary.toLowerCase() === conn.signer.toLowerCase()) {
    // Primary key: aaWallet.execute(target, value, data); the Nuru Account
    // forwards `value` from its own balance.
    txHash = await nuruSign("eth_sendTransaction", [{
      from: conn.signer,
      to: conn.address,
      data: AMID.encodeFunctionData("execute", [to, value_, data]),
      value: "0x0",
      gasPrice: "0x" + GAS_PRICE_WEI.toString(16),
      gas: "0x" + (gas + EXECUTE_GAS_OVERHEAD).toString(16),
    }], onQr);
  } else {
    // Linked key: sign the relayed-call digest; the relay pays gas.
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const nonce = AMID.decodeFunctionResult("signerNonce", await p.call({ to: conn.address, data: AMID.encodeFunctionData("signerNonce", [conn.signer]) }))[0];
    const digest = AMID.decodeFunctionResult("getRelayedCallHash", await p.call({
      to: conn.address,
      data: AMID.encodeFunctionData("getRelayedCallHash", [conn.signer, to, value_, data, nonce, BigInt(deadline)]),
    }))[0];
    const signature = await nuruSign("eth_sign", [conn.signer, digest], onQr);
    const payload = { wallet: conn.address, signer: conn.signer, target: to, data, value: value_.toString(), deadline, signature, gasLimit: RELAY_GAS_LIMIT };
    await postRelay("/relay/preview", payload);
    txHash = (await postRelay("/relay", payload)).txHash;
  }
  await waitForReceipt(txHash);
  return txHash;
}

/* -------- Inside the Nuru in-app browser (window.ethereum._isNuruWallet) -------- */

export const nuruInjected = () => (typeof window !== "undefined" && window.ethereum?._isNuruWallet ? window.ethereum : null);

// The Nuru browser exposes the signing key as the account and the Nuru Account
// via nuru_getIdentity; it wraps txs through the Nuru Account itself.
export async function nuruBrowserConnect() {
  const eth = nuruInjected();
  const [key] = await eth.request({ method: "eth_requestAccounts" });
  let identity = null;
  try { identity = await eth.request({ method: "nuru_getIdentity" }); } catch { }
  return {
    type: "nuru-browser",
    address: ethers.getAddress(identity?.aaWallet || key),
    signer: ethers.getAddress(key),
    ain: identity?.ain ? String(identity.ain).toUpperCase() : "",
    handle: identity?.primaryHandle || "",
  };
}
