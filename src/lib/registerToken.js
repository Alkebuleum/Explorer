// Paid token listing in the ecosystem registry, using the same backend,
// treasury and fee as JollofSwap: pay the fee in ALKE, then hand the payment
// tx to the registry API, which waits for confirmations and writes `tokens`.
import { ethers } from "ethers";
import { rpc } from "./rpc";

export const REGISTRY_API = (process.env.REACT_APP_REGISTRY_API || "https://faucet.alkebuleum.com/api").replace(/\/$/, "");
export const REGISTRY_TREASURY = process.env.REACT_APP_REGISTRY_TREASURY || "";
export const REGISTRY_FEE_ALKE = Number(process.env.REACT_APP_REGISTRY_FEE_ALKE || 2000);
export const REGISTRY_MIN_CONFS = Number(process.env.REACT_APP_REGISTRY_MIN_CONFS || 2);

// Remember a paid-but-unfinished registration so a reload doesn't lose it.
const pendingKey = (token) => `alkescan:pendingRegistration:${token.toLowerCase()}`;
export function loadPendingPayment(token) {
  try { return localStorage.getItem(pendingKey(token)) || ""; } catch { return ""; }
}
function savePendingPayment(token, txHash) {
  try {
    if (txHash) localStorage.setItem(pendingKey(token), txHash);
    else localStorage.removeItem(pendingKey(token));
  } catch { }
}

async function waitForReceipt(txHash, { timeoutMs = 120000 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = await rpc("eth_getTransactionReceipt", [txHash]).catch(() => null);
    if (r) {
      if (parseInt(r.status, 16) !== 1) throw new Error("The fee payment transaction failed on chain.");
      return r;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("Timed out waiting for the fee payment to be mined. Use its tx hash to resume.");
}

// `send` is the wallet's sendTransaction (resolves with the mined tx hash).
export async function payRegistryFee(tokenAddress, send) {
  if (!ethers.isAddress(REGISTRY_TREASURY)) throw new Error("Registry treasury isn't configured.");
  const txHash = await send({ to: REGISTRY_TREASURY, value: ethers.parseEther(String(REGISTRY_FEE_ALKE)) }, `Pay ${REGISTRY_FEE_ALKE.toLocaleString()} ALKE listing fee`);
  savePendingPayment(tokenAddress, txHash);
  await waitForReceipt(txHash);
  return txHash;
}

async function submitOnce(body) {
  const res = await fetch(`${REGISTRY_API}/tokens/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// Polls the registry API until it accepts or rejects the listing.
export async function submitRegistration({ paymentTxHash, tokenAddress, ownerWallet, token, onProgress = () => { }, timeoutMs = 300000 }) {
  const body = {
    paymentTxHash,
    tokenAddress: ethers.getAddress(tokenAddress),
    ownerWallet: ethers.getAddress(ownerWallet),
    token,
  };
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    let r;
    try {
      r = await submitOnce(body);
    } catch {
      onProgress("Registry API unreachable, retrying…");
      await new Promise((res) => setTimeout(res, 4000));
      continue;
    }
    if (r.status === 202 && r.data?.pending) {
      onProgress(`Confirming payment ${r.data.confirmations ?? 0}/${r.data.required ?? REGISTRY_MIN_CONFS}…`);
    } else if (r.status >= 200 && r.status < 300 && r.data?.ok) {
      savePendingPayment(tokenAddress, null);
      return r.data;
    } else {
      throw new Error(r.data?.error || `Registration failed (HTTP ${r.status}).`);
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error("The registry is still confirming. Come back and resume with your payment tx hash.");
}
