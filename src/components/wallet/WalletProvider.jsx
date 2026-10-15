import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../../lib/rpc";
import { shortHash } from "../../lib/format";
import { CopyButton } from "../ui/Bits";
import { balanceOf, planPayment, shortMessage, toAlke } from "../../lib/payPlan";

const ConnectModal = lazy(() => import("./WalletModals").then((m) => ({ default: m.ConnectModal })));
const SignModal = lazy(() => import("./WalletModals").then((m) => ({ default: m.SignModal })));

const STORAGE_KEY = "alkescan:wallet";
const WalletCtx = createContext(null);

const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; } };
const save = (c) => { try { c ? localStorage.setItem(STORAGE_KEY, JSON.stringify(c)) : localStorage.removeItem(STORAGE_KEY); } catch { } };

async function waitMined(txHash) {
    for (let i = 0; i < 80; i++) {
        const r = await rpc("eth_getTransactionReceipt", [txHash]).catch(() => null);
        if (r) {
            if (parseInt(r.status, 16) !== 1) throw new Error("Transaction reverted on chain.");
            return r;
        }
        await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error("Transaction not confirmed yet. Check your wallet for its status.");
}

// rpc.alkebuleum.com currently fails every eth_estimateGas with "-32603
// internal error", while eth_call and eth_createAccessList work. So we always
// pass our own gas limit (as JollofSwap does); otherwise Nuru and MetaMask
// estimate it themselves and fail. `from` is whoever is msg.sender of the call.
async function gasFor(from, tx, value) {
    const call = { from, to: tx.to, data: tx.data || "0x", value: "0x" + value.toString(16) };
    let used = null;
    try { used = BigInt(await rpc("eth_estimateGas", [call])); } catch { }
    if (used == null) {
        try { used = BigInt((await rpc("eth_createAccessList", [call, "latest"])).gasUsed); } catch { }
    }
    if (used == null) {
        // Both failed: if the call itself reverts, say so instead of sending a doomed tx.
        try { await rpc("eth_call", [call, "latest"]); } catch (e) {
            throw new Error(`This transaction would fail on chain: ${e?.message || e}`);
        }
        return 300_000n;
    }
    return (used * 13n) / 10n + 10_000n;
}

// Turns the node's opaque gas-estimate failure into something actionable.
function explainSendError(e) {
    const msg = String(e?.message || e);
    if (/-32603|internal error/i.test(msg)) {
        return new Error(
            "The network couldn't process this transaction (RPC internal error). Your funds weren't moved. " +
            "Please try again in a moment, and contact the Alkebuleum team if it keeps happening."
        );
    }
    return e;
}

export function WalletProvider({ children }) {
    const [conn, setConn] = useState(load);
    const [connecting, setConnecting] = useState(false);
    const [signQr, setSignQr] = useState(null); // { uri, label }
    const pending = useRef(null); // { resolve, reject } for openConnect()

    // A browser-wallet session is only kept while the wallet still exposes the account.
    useEffect(() => {
        if (conn?.type !== "injected" && conn?.type !== "nuru-browser") return;
        if (!window.ethereum) { setConn(null); save(null); return; }
        window.ethereum.request({ method: "eth_accounts" }).then((accs) => {
            if (!accs?.length) { setConn(null); save(null); }
        }).catch(() => { });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Follow account switches / disconnects in the browser wallet.
    useEffect(() => {
        if (conn?.type !== "injected" || !window.ethereum?.on) return;
        const onAccounts = (accs) => {
            const next = accs?.[0] ? { type: "injected", address: accs[0] } : null;
            setConn(next);
            save(next);
        };
        window.ethereum.on("accountsChanged", onAccounts);
        return () => window.ethereum.removeListener?.("accountsChanged", onAccounts);
    }, [conn?.type]);

    const finishConnect = (c) => {
        setConn(c);
        save(c);
        setConnecting(false);
        pending.current?.resolve(c);
        pending.current = null;
    };

    const cancelConnect = () => {
        setConnecting(false);
        pending.current?.reject(new Error("Wallet connection cancelled."));
        pending.current = null;
    };

    // Opens the connect dialog; resolves with the connection.
    const openConnect = useCallback(() => {
        setConnecting(true);
        return new Promise((resolve, reject) => { pending.current = { resolve, reject }; });
    }, []);

    const ensureConnected = useCallback(() => (conn ? Promise.resolve(conn) : openConnect()), [conn, openConnect]);

    const disconnect = useCallback(() => { setConn(null); save(null); }, []);

    // Sends {to, data, value} from the connected wallet; resolves with the
    // tx hash once it's mined.
    const sendTransaction = useCallback(async (tx, label = "Approve transaction") => {
        const c = await ensureConnected();
        const value = BigInt(tx.value || 0);
        // Checking funds first gives a clear message instead of a failed gas estimate.
        const plan = value > 0n ? await planPayment(c, value, { allowSigner: !!tx.allowSigner }) : null;
        if (plan?.mode === "short") throw new Error(shortMessage(c, plan));
        try {
            if (plan?.mode === "signer") return await sendFromSigner(c, tx, value, label);
            if (plan?.mode === "consolidate") {
                await sendFromSigner(c, { to: c.address }, plan.topUp, `Move ${toAlke(plan.topUp)} ALKE into your Nuru Account`);
            }
            return await send(c, tx, value, label);
        } catch (e) {
            throw explainSendError(e);
        }
    }, [ensureConnected]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sends straight from the Nuru signer key (Nuru doesn't wrap it), so the key
    // is msg.sender and pays both the value and the gas.
    const sendFromSigner = async (c, tx, value, label) => {
        const gas = tx.gas ? BigInt(tx.gas) : await gasFor(c.signer, tx, value);
        if (c.type === "nuru") {
            try {
                const { nuruSendFromSigner } = await import("../../lib/nuru");
                return await nuruSendFromSigner(c, { ...tx, value, gas }, (uri) => setSignQr({ uri, label }));
            } finally {
                setSignQr(null);
            }
        }
        // In the Nuru browser, `from` = the signer is how a dApp asks for a direct send.
        const hash = await window.ethereum.request({
            method: "eth_sendTransaction",
            params: [{ from: c.signer, to: tx.to, data: tx.data || "0x", value: "0x" + value.toString(16), gas: "0x" + gas.toString(16) }],
        });
        await waitMined(hash);
        return hash;
    };

    const send = async (c, tx, value, label) => {
        if (c.type === "nuru") {
            try {
                const { nuruSendTransaction } = await import("../../lib/nuru");
                return await nuruSendTransaction(c, { ...tx, value }, (uri) => setSignQr({ uri, label }));
            } finally {
                setSignQr(null);
            }
        }
        if (c.type === "nuru-browser") {
            // The Nuru browser wraps the call through the Nuru Account itself (adding
            // its own execute() overhead to our gas), so the Nuru Account is msg.sender.
            const gas = tx.gas ? BigInt(tx.gas) : await gasFor(c.address, tx, value);
            const hash = await window.ethereum.request({
                method: "eth_sendTransaction",
                params: [{ to: tx.to, data: tx.data || "0x", value: "0x" + value.toString(16), gas: "0x" + gas.toString(16) }],
            });
            await waitMined(hash);
            return hash;
        }
        const { getSigner } = await import("../../lib/wallet");
        const signer = await getSigner();
        const gasLimit = tx.gas ? BigInt(tx.gas) : await gasFor(c.address, tx, value);
        const sent = await signer.sendTransaction({ to: tx.to, data: tx.data || "0x", value, gasLimit });
        await waitMined(sent.hash);
        return sent.hash;
    };

    return (
        <WalletCtx.Provider value={{ conn, openConnect, ensureConnected, disconnect, sendTransaction }}>
            {children}
            <Suspense fallback={null}>
                {connecting && <ConnectModal onConnected={finishConnect} onClose={cancelConnect} />}
                {signQr && <SignModal uri={signQr.uri} label={signQr.label} />}
            </Suspense>
        </WalletCtx.Provider>
    );
}

export function useWallet() {
    const ctx = useContext(WalletCtx);
    if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
    return ctx;
}

// Header control: connect, or show the connected account.
function BalanceLine({ wei, note }) {
    return (
        <div className="mt-0.5 text-xs text-ink-mute">
            {wei === undefined ? "…" : wei === null ? "Balance unavailable" : <span className="font-mono text-ink-dim">{toAlke(wei)} ALKE</span>}
            {note && <> · {note}</>}
        </div>
    );
}

export function WalletButton() {
    const { conn, openConnect, disconnect } = useWallet();
    const [open, setOpen] = useState(false);
    const [balances, setBalances] = useState({});
    // Balances load when the menu opens, so the header stays free of polling.
    useEffect(() => {
        if (!open || !conn) return;
        const addrs = [...new Set([conn.address, conn.signer].filter(Boolean).map((a) => a.toLowerCase()))];
        Promise.all(addrs.map((a) => balanceOf(a).then((b) => [a, b]).catch(() => [a, null])))
            .then((rows) => setBalances(Object.fromEntries(rows)));
    }, [open, conn]);
    if (!conn) {
        return <button onClick={() => openConnect().catch(() => { })} className="btn-violet btn-sm py-2">Connect</button>;
    }
    const isNuru = conn.type !== "injected" && !!conn.signer;
    // A Nuru Account is identified by its handle/AIN; the key in use is what varies.
    const label = conn.handle || (isNuru && conn.ain ? conn.ain : shortHash(isNuru ? conn.signer : conn.address, 4));
    const close = () => setOpen(false);
    const bal = (addr) => balances[addr?.toLowerCase()];
    return (
        <div className="relative">
            <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-full border border-line-2 px-3 py-1.5 text-sm hover:border-violet">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {label}
            </button>
            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-surface p-3 text-sm shadow-xl">
                    {isNuru ? (
                        <>
                            <div className="text-xs text-ink-mute">Nuru Account</div>
                            <div className="mt-0.5 font-medium">{conn.handle || (conn.ain ? conn.ain : shortHash(conn.address, 4))}</div>
                            {conn.handle && conn.ain && <div className="text-xs text-ink-mute">{conn.ain}</div>}
                            <BalanceLine wei={bal(conn.address)} note="Holds funds securely" />
                            <div className="mt-3 text-xs text-ink-mute">Signer key</div>
                            <div className="mt-0.5 flex items-start gap-1">
                                <span className="min-w-0 break-all font-mono text-xs">{conn.signer}</span>
                                <CopyButton value={conn.signer} />
                            </div>
                            <BalanceLine wei={bal(conn.signer)} note="Signs and pays gas" />
                        </>
                    ) : (
                        <>
                            <div className="text-xs text-ink-mute">Signer key · browser wallet</div>
                            <div className="mt-0.5 flex items-start gap-1">
                                <span className="min-w-0 break-all font-mono text-xs">{conn.address}</span>
                                <CopyButton value={conn.address} />
                            </div>
                            <BalanceLine wei={bal(conn.address)} />
                        </>
                    )}
                    <div className="mt-3 flex gap-2">
                        <Link to={`/address/${conn.address}`} onClick={close} className="btn-ghost btn-sm flex-1">{isNuru ? "Account" : "View"}</Link>
                        {isNuru && <Link to={`/address/${conn.signer}`} onClick={close} className="btn-ghost btn-sm flex-1">Signer</Link>}
                        <button onClick={() => { disconnect(); close(); }} className="btn-ghost btn-sm flex-1">Disconnect</button>
                    </div>
                </div>
            )}
        </div>
    );
}
