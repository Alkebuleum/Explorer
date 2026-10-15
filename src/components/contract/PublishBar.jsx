import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore/lite";
import { Spinner } from "../ui/Loading";
import { useWallet } from "../wallet/WalletProvider";
import PayerBalance from "../wallet/PayerBalance";
import { db, isAdminUser, currentUser } from "../../lib/firebase";
import { publishVerified } from "../../lib/verifiedStore";
import { VERIFY_FEE_ALKE, payVerificationFee, submitVerificationRequest } from "../../lib/verificationRequests";
import { CHAIN_CURRENCY } from "../../lib/rpc";

// A fee paid but not yet filed survives a reload, so nobody pays twice.
const paidKey = (address) => `alkescan:verifyPayment:${address.toLowerCase()}`;
const loadPaid = (a) => { try { return localStorage.getItem(paidKey(a)) || ""; } catch { return ""; } };
const savePaid = (a, v) => { try { v ? localStorage.setItem(paidKey(a), v) : localStorage.removeItem(paidKey(a)); } catch { } };

async function findPendingRequest(address) {
    const snap = await getDocs(query(collection(db, "verificationRequests"), where("address", "==", address.toLowerCase()), where("status", "==", "pending")));
    return snap.empty ? null : snap.docs[0].id;
}

// Shown on a verification that only exists in this browser session.
export default function PublishBar({ record, onPublished }) {
    const { conn, ensureConnected, sendTransaction } = useWallet();
    const [admin, setAdmin] = useState(false);
    const [pending, setPending] = useState(null); // request id awaiting review
    const [paidTx, setPaidTx] = useState(() => loadPaid(record.address));
    const [step, setStep] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        currentUser().then((u) => setAdmin(isAdminUser(u))).catch(() => { });
        findPendingRequest(record.address).then(setPending).catch(() => { });
    }, [record.address]);

    async function publishNow() {
        setStep("Publishing…");
        setErr(null);
        try {
            onPublished(await publishVerified(record));
        } catch (e) {
            setErr(e.code === "permission-denied" ? "This account isn't allowed to publish (Firestore rules rejected the write)." : e.message);
        } finally {
            setStep(null);
        }
    }

    async function payAndSubmit() {
        setErr(null);
        try {
            const c = await ensureConnected();
            let tx = paidTx;
            if (!tx) {
                setStep(`Approve the ${VERIFY_FEE_ALKE.toLocaleString()} ${CHAIN_CURRENCY} fee in your wallet…`);
                tx = await payVerificationFee(sendTransaction);
                setPaidTx(tx);
                savePaid(record.address, tx);
            }
            setStep("Submitting for review…");
            const id = await submitVerificationRequest(record, { paymentTxHash: tx, payer: c.address, payerAin: c.ain });
            savePaid(record.address, null);
            setPaidTx("");
            setPending(id);
        } catch (e) {
            setErr(e.shortMessage || e.message || String(e));
        } finally {
            setStep(null);
        }
    }

    if (pending && !admin) {
        return (
            <div className="rounded-xl border border-violet/30 bg-violet/5 p-4 text-sm">
                <div className="font-medium">Submitted for publication</div>
                <p className="text-ink-dim">
                    The Alkebuleum team will recompile your source and publish it after checking the fee payment.
                    You can close this page; the contract shows as verified once it's approved.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-violet/30 bg-violet/5 p-4 sm:flex-row sm:items-center">
            <div className="flex-1 text-sm">
                <div className="font-medium">Verified in this browser only. Not published yet.</div>
                <p className="text-ink-dim">
                    {admin
                        ? "Publishing saves the source to AlkeScan so every visitor sees this contract as verified."
                        : `Publish it for everyone for ${VERIFY_FEE_ALKE.toLocaleString()} ${CHAIN_CURRENCY}. The team re-checks the source before it goes live.`}
                </p>
                {paidTx && !admin && <p className="mt-1 text-xs text-ink-mute">Fee already paid ({paidTx.slice(0, 10)}…). Submitting won't charge you again.</p>}
                {!admin && !paidTx && <PayerBalance feeAlke={VERIFY_FEE_ALKE} className="mt-1" />}
                {step && <p className="mt-1 flex items-center gap-2 text-ink-mute"><Spinner className="h-3 w-3" />{step}</p>}
                {err && <p className="mt-1 text-rose-600 dark:text-rose-300">{err}</p>}
            </div>
            {admin ? (
                <button onClick={publishNow} disabled={!!step} className="btn-violet shrink-0">Publish to AlkeScan</button>
            ) : (
                <button onClick={payAndSubmit} disabled={!!step} className="btn-violet shrink-0">
                    {paidTx ? "Submit for publication" : `${conn ? "" : "Connect & "}Pay ${VERIFY_FEE_ALKE.toLocaleString()} ${CHAIN_CURRENCY}`}
                </button>
            )}
        </div>
    );
}
