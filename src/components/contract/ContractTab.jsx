import React, { useEffect, useState } from "react";
import Loading from "../ui/Loading";
import { CopyButton } from "../ui/Bits";
import VerifiedContract from "./VerifiedContract";
import VerifyForm from "./VerifyForm";
import { collection, getDocs, query, where } from "firebase/firestore/lite";
import Badge from "../ui/Badge";
import { getVerified, saveVerified } from "../../lib/verifiedStore";
import { db } from "../../lib/firebase";

function Bytecode({ code }) {
    return (
        <details className="rounded-xl border border-line px-4 py-3 text-sm">
            <summary className="cursor-pointer text-ink-dim">Deployed bytecode · {((code.length - 2) / 2).toLocaleString()} bytes</summary>
            <div className="mt-3 flex items-start gap-1">
                <pre className="max-h-60 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink-dim">{code}</pre>
                <CopyButton value={code} />
            </div>
        </details>
    );
}

export default function ContractTab({ address, code, onVerifiedChange }) {
    const [record, setRecord] = useState(undefined); // undefined = loading
    const [verifying, setVerifying] = useState(false);
    const [inReview, setInReview] = useState(false);

    useEffect(() => {
        let mounted = true;
        setRecord(undefined);
        setVerifying(false);
        setInReview(false);
        getVerified(address).then((r) => mounted && setRecord(r)).catch(() => mounted && setRecord(null));
        getDocs(query(collection(db, "verificationRequests"), where("address", "==", address.toLowerCase()), where("status", "==", "pending")))
            .then((s) => mounted && setInReview(!s.empty))
            .catch(() => { });
        return () => { mounted = false; };
    }, [address]);

    useEffect(() => {
        if (record !== undefined) onVerifiedChange?.(record);
    }, [record, onVerifiedChange]);

    if (record === undefined) return <div className="p-5"><Loading /></div>;

    if (record) return <VerifiedContract address={address} record={record} onPublished={setRecord} />;

    if (verifying) {
        return (
            <VerifyForm
                address={address}
                onCancel={() => setVerifying(false)}
                onVerified={async (r) => setRecord(await saveVerified(r))}
            />
        );
    }

    return (
        <div className="space-y-5 p-5">
            <div className="flex flex-col gap-4 rounded-xl border border-gold/30 bg-gold/5 p-5 sm:flex-row sm:items-center">
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-display font-medium">
                        This contract's source code isn't verified yet
                        {inReview && <Badge tone="violet">Publication pending review</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-ink-dim">
                        Are you the deployer? Verify the source with your Standard JSON input or a flattened file.
                        Verified contracts show their code, ABI and Read/Write functions to everyone.
                    </p>
                </div>
                <button onClick={() => setVerifying(true)} className="btn-violet shrink-0">Verify &amp; publish</button>
            </div>
            <Bytecode code={code} />
        </div>
    );
}
