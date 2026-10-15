import React, { useEffect, useState } from "react";
import { useWallet, checkFunds, toAlke } from "./WalletProvider";
import { shortHash } from "../../lib/format";

// One line under a Pay button: which account pays and whether it can afford
// `feeAlke`. Renders nothing until a wallet is connected.
export default function PayerBalance({ feeAlke, className = "" }) {
    const { conn } = useWallet();
    const [funds, setFunds] = useState(undefined); // undefined = loading, null = unknown

    useEffect(() => {
        if (!conn) return;
        let live = true;
        const value = BigInt(feeAlke) * 10n ** 18n;
        const load = () => checkFunds(conn, value).then((f) => live && setFunds(f)).catch(() => live && setFunds(null));
        setFunds(undefined);
        load();
        // Pick up a top-up made while the page is open.
        const t = setInterval(load, 15000);
        return () => { live = false; clearInterval(t); };
    }, [conn, feeAlke]);

    if (!conn) return null;
    const who = conn.handle || shortHash(conn.address, 4);
    const from = `${conn.type?.startsWith("nuru") ? "Nuru Account" : "Wallet"} ${who}`;

    if (funds === undefined) return <p className={`text-xs text-ink-mute ${className}`}>Paying from {from} · checking balance…</p>;
    if (funds === null) return <p className={`text-xs text-ink-mute ${className}`}>Paying from {from}</p>;

    const short = !funds.enough || funds.gasKeyEmpty;
    return (
        <p className={`text-xs ${short ? "text-rose-600 dark:text-rose-300" : "text-ink-mute"} ${className}`}>
            Paying from {from} · balance <span className="font-mono">{toAlke(funds.balance)} ALKE</span>
            {!funds.enough && ` · not enough, needs ${feeAlke.toLocaleString()} ALKE${funds.isNuru ? " in the Nuru Account" : " plus gas"}`}
            {funds.enough && funds.gasKeyEmpty && " · your signing key needs a little ALKE for gas"}
            {!short && " · enough to pay"}
        </p>
    );
}
