// Paid contract publishing without a backend:
//   1. The deployer verifies in their browser, pays the fee to the registry
//      treasury, and files a request (sources included) keyed by the payment tx.
//   2. An admin reviews it on /admin: AlkeScan checks the payment on chain and
//      recompiles the source in the admin's browser. Only a fresh match is
//      published, so a forged request can't produce a "verified" badge.
//
// verificationRequests/{paymentTxHash}             metadata + status
// verificationRequests/{paymentTxHash}/chunks/{n}  { files: [{ path, content }] }
import { ethers } from "ethers";
import { collection, doc, getDocs, query, where, updateDoc, writeBatch } from "firebase/firestore/lite";
import { db, ensureSignedIn } from "./firebase";
import { rpc, CHAIN_ID } from "./rpc";
import { chunkSources, readChunkedRecord, publishVerified } from "./verifiedStore";
import { verifyContract, toStandardJson, detectCompilerVersion } from "./verify";
import { REGISTRY_TREASURY, REGISTRY_FEE_ALKE } from "./registerToken";

const COLLECTION = "verificationRequests";
export const VERIFY_FEE_ALKE = Number(process.env.REACT_APP_VERIFY_FEE_ALKE || REGISTRY_FEE_ALKE);
const FEE_WEI = ethers.parseEther(String(VERIFY_FEE_ALKE));

const EXECUTE = new ethers.Interface(["function execute(address target, uint256 value, bytes data)"]);

export async function payVerificationFee(send) {
  if (!ethers.isAddress(REGISTRY_TREASURY)) throw new Error("Fee treasury isn't configured.");
  // checkPayment accepts a direct payment, so the Nuru signer key may pay it.
  return send({ to: REGISTRY_TREASURY, value: FEE_WEI, allowSigner: true }, `Pay ${VERIFY_FEE_ALKE.toLocaleString()} ALKE publishing fee`);
}

export async function submitVerificationRequest(record, { paymentTxHash, payer, payerAin }) {
  await ensureSignedIn();
  const id = paymentTxHash.toLowerCase();
  const ref = doc(db, COLLECTION, id);
  const chunks = chunkSources(record.sources);
  const batch = writeBatch(db);
  chunks.forEach((files, i) => batch.set(doc(ref, "chunks", String(i)), { files }));
  batch.set(ref, {
    status: "pending",
    chainId: CHAIN_ID,
    address: record.address.toLowerCase(),
    contractName: record.contractName,
    sourcePath: record.sourcePath,
    compilerVersion: record.compilerVersion,
    language: record.language,
    matchType: record.matchType,
    settingsJson: JSON.stringify(record.settings || {}),
    creationTx: record.creationTx || null,
    paymentTxHash: id,
    payer: payer || null,
    payerAin: payerAin || null,
    requestedAt: new Date().toISOString(),
    sourceFileCount: Object.keys(record.sources).length,
    chunkCount: chunks.length,
  });
  await batch.commit();
  return id;
}

export async function listRequests(status = "pending") {
  const snap = await getDocs(query(collection(db, COLLECTION), where("status", "==", status)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : 1));
}

// Checks the fee payment on chain. Handles a plain transfer to the treasury
// and a Nuru Account execute(treasury, fee, …); relayed Nuru payments can't be
// decoded without the relay contract's ABI, so they're flagged for a manual look.
export async function checkPayment(txHash) {
  const [tx, rcpt] = await Promise.all([
    rpc("eth_getTransactionByHash", [txHash]),
    rpc("eth_getTransactionReceipt", [txHash]),
  ]);
  if (!tx) return { ok: false, note: "Payment transaction not found." };
  if (!rcpt || parseInt(rcpt.status, 16) !== 1) return { ok: false, note: "Payment transaction failed or isn't mined." };
  const treasury = REGISTRY_TREASURY.toLowerCase();
  if (tx.to?.toLowerCase() === treasury) {
    return BigInt(tx.value) >= FEE_WEI
      ? { ok: true, note: `Direct payment of ${ethers.formatEther(BigInt(tx.value))} ALKE.` }
      : { ok: false, note: `Paid only ${ethers.formatEther(BigInt(tx.value))} ALKE.` };
  }
  try {
    const [target, value] = EXECUTE.decodeFunctionData("execute", tx.input);
    if (target.toLowerCase() === treasury) {
      return value >= FEE_WEI
        ? { ok: true, note: `Paid ${ethers.formatEther(value)} ALKE from Nuru Account ${tx.to}.` }
        : { ok: false, note: `Paid only ${ethers.formatEther(value)} ALKE.` };
    }
  } catch { }
  return { ok: null, note: "Couldn't decode this payment automatically (e.g. a relayed Nuru payment). Check the transaction before approving." };
}

// Recompiles the request's source in this browser; publishes only on a match.
export async function approveRequest(id, { onStep } = {}) {
  const ref = doc(db, COLLECTION, id);
  const req = await readChunkedRecord(ref);
  if (!req) throw new Error("Request not found.");
  // Use the version recorded in the deployed bytecode, in case the requester
  // picked a different one that happened to produce the same code.
  const deployedWith = await detectCompilerVersion(req.address).catch(() => null);
  const record = await verifyContract({
    address: req.address,
    input: toStandardJson(req),
    compilerVersion: deployedWith || req.compilerVersion,
    contractHint: `${req.sourcePath}:${req.contractName}`,
    creationTxHash: req.creationTx,
    onStep,
  });
  await publishVerified(record);
  await updateDoc(ref, { status: "approved", reviewedAt: new Date().toISOString() });
  return record;
}

export async function rejectRequest(id, reason) {
  await updateDoc(doc(db, COLLECTION, id), { status: "rejected", rejectReason: reason || "", reviewedAt: new Date().toISOString() });
}
