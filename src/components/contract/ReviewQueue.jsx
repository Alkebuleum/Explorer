import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../ui/Badge";
import Loading, { Spinner } from "../ui/Loading";
import { Empty } from "../ui/Bits";
import { shortHash } from "../../lib/format";
import { listRequests, checkPayment, approveRequest, rejectRequest } from "../../lib/verificationRequests";

function RequestRow({ req, onDone }) {
    const [payment, setPayment] = useState(null);
    const [step, setStep] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        checkPayment(req.paymentTxHash).then(setPayment).catch((e) => setPayment({ ok: false, note: e.message }));
    }, [req.paymentTxHash]);

    async function approve() {
        setErr(null);
        try {
            await approveRequest(req.id, { onStep: setStep });
            onDone();
        } catch (e) {
            setErr(e.compilerErrors ? `${e.message}\n${e.compilerErrors[0]}` : e.message);
        } finally {
            setStep(null);
        }
    }

    async function reject() {
        const reason = window.prompt("Reason for rejecting (shown to nobody but admins):", "Fee not paid");
        if (reason === null) return;
        setStep("Rejecting…");
        try {
            await rejectRequest(req.id, reason);
            onDone();
        } catch (e) {
            setErr(e.message);
        } finally {
            setStep(null);
        }
    }

    return (
        <li className="space-y-2 border-b border-line px-5 py-4 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{req.contractName}</span>
                <Link to={`/address/${req.address}`} className="link font-mono text-[13px]">{shortHash(req.address)}</Link>
                <span className="text-xs text-ink-mute">v{req.compilerVersion} · {req.sourceFileCount} files · {new Date(req.requestedAt).toLocaleString()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                {payment == null ? <Spinner className="h-3 w-3" /> : (
                    <Badge tone={payment.ok ? "success" : payment.ok === false ? "danger" : "warn"}>
                        {payment.ok ? "Fee paid" : payment.ok === false ? "Payment problem" : "Check payment"}
                    </Badge>
                )}
                <span className="text-ink-dim">{payment?.note}</span>
                <Link to={`/tx/${req.paymentTxHash}`} className="link text-xs">payment tx</Link>
                {req.payer && <span className="text-xs text-ink-mute">from {shortHash(req.payer, 4)}{req.payerAin ? ` · AIN ${req.payerAin}` : ""}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={approve} disabled={!!step || payment?.ok === false} className="btn-violet btn-sm">Recompile &amp; publish</button>
                <button onClick={reject} disabled={!!step} className="btn-ghost btn-sm">Reject</button>
                {step && <span className="flex items-center gap-2 text-xs text-ink-mute"><Spinner className="h-3 w-3" />{step}</span>}
            </div>
            {err && <p className="whitespace-pre-wrap text-sm text-rose-600 dark:text-rose-300">{err}</p>}
        </li>
    );
}

export default function ReviewQueue() {
    const [reqs, setReqs] = useState(null);
    const [err, setErr] = useState(null);
    const load = useCallback(() => {
        setErr(null);
        listRequests("pending").then(setReqs).catch((e) => setErr(e.message));
    }, []);
    useEffect(load, [load]);

    if (err) return <p className="p-5 text-sm text-rose-600 dark:text-rose-300">{err}</p>;
    if (!reqs) return <div className="p-5"><Loading /></div>;
    if (!reqs.length) return <Empty>No contracts waiting for review.</Empty>;
    return <ul>{reqs.map((r) => <RequestRow key={r.id} req={r} onDone={load} />)}</ul>;
}
