import React, { useEffect, useState } from "react";
import { useWallet } from "./WalletProvider";
import { planPayment, toAlke, SIGNER_GAS_BUFFER } from "../../lib/payPlan";
import { shortHash } from "../../lib/format";

// One line under a Pay button: where the fee will come from and whether it's
// covered. `allowSigner` must match what the payment passes to sendTransaction.
// Renders nothing until a wallet is connected.
export default function PayerBalance({ feeAlke, allowSigner = false, className = "" }) {
    const { conn } = useWallet();
    const [plan, setPlan] = useState(undefined); // undefined = loading, null = unknown

    useEffect(() => {
        if (!conn) return;
        let live = true;
        const value = BigInt(feeAlke) * 10n ** 18n;
        const load = () => planPayment(conn, value, { allowSigner }).then((p) => live && setPlan(p)).catch(() => live && setPlan(null));
        setPlan(undefined);
        load();
        // Pick up a top-up made while the page is open.
        const t = setInterval(load, 15000);
        return () => { live = false; clearInterval(t); };
    }, [conn, feeAlke, allowSigner]);

    if (!conn) return null;
    const muted = `text-xs text-ink-mute ${className}`;
    const who = conn.handle || (conn.ain ? `AIN ${conn.ain}` : shortHash(conn.address, 4));
    const alke = (wei) => <span className="font-mono">{toAlke(wei)} ALKE</span>;

    if (plan === undefined) return <p className={muted}>Checking balance…</p>;
    if (plan === null) return <p className={muted}>Paying from Nuru Account {who}</p>;
    const fee = `${feeAlke.toLocaleString()} ALKE`;

    if (!plan.isNuru) {
        return plan.mode === "wallet"
            ? <p className={muted}>Paying from {shortHash(conn.address, 4)} · balance {alke(plan.account)} · enough to pay</p>
            : <p className={`text-xs text-rose-600 dark:text-rose-300 ${className}`}>Balance {alke(plan.account)} · not enough, needs {fee} plus gas</p>;
    }

    switch (plan.mode) {
        case "account":
            return <p className={muted}>Paying from Nuru Account {who} · balance {alke(plan.account)} · enough to pay</p>;
        case "signer":
            return (
                <p className={`text-xs text-amber-700 dark:text-amber-300 ${className}`}>
                    Your Nuru Account has {alke(plan.account)}, so this will be paid from your signer key ({alke(plan.signer)}).
                </p>
            );
        case "consolidate":
            return (
                <p className={`text-xs text-amber-700 dark:text-amber-300 ${className}`}>
                    Your Nuru Account has {alke(plan.account)}. {alke(plan.topUp)} will first move from your signer key into it, then the fee is paid. You'll approve twice.
                </p>
            );
        default:
            return (
                <p className={`text-xs text-rose-600 dark:text-rose-300 ${className}`}>
                    {plan.account >= plan.value && plan.gasKeyEmpty
                        ? "Your signer key needs a little ALKE for gas."
                        : <>Not enough: Nuru Account {alke(plan.account)} + signer key {alke(plan.signer)}. Needs {fee} (the signer keeps {toAlke(SIGNER_GAS_BUFFER)} for gas).</>}
                </p>
            );
    }
}
