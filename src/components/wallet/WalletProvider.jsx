import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../../lib/rpc";
import { shortHash } from "../../lib/format";

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

export const toAlke = (wei) => (Number(wei / 10n ** 15n) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });
const balanceOf = async (addr) => BigInt(await rpc("eth_getBalance", [addr, "latest"]));
const PRIMARY_SELECTOR = "0xc6dbdf61"; // primary()

// Where a payment's ALKE comes from and whether it covers `value`.
// Null when we can't tell (a Nuru session without its Nuru Account address).
export async function checkFunds(c, value) {
    const isNuru = c.type === "nuru" || c.type === "nuru-browser";
    if (isNuru && (!c.signer || c.address.toLowerCase() === c.signer.toLowerCase())) return null;
    const balance = await balanceOf(c.address);
    let gasKeyEmpty = false;
    if (isNuru) {
        // The primary key pays gas for execute(); linked keys go through the gasless relay.
        const primary = await rpc("eth_call", [{ to: c.address, data: PRIMARY_SELECTOR }, "latest"]).catch(() => null);
        if (primary && primary.length >= 66 && ("0x" + primary.slice(-40)).toLowerCase() === c.signer.toLowerCase()) {
            gasKeyEmpty = (await balanceOf(c.signer)) === 0n;
        }
    }
    return { isNuru, balance, enough: balance >= value, gasKeyEmpty };
}

// Checks funds before asking the wallet, so a shortfall gets a clear message
// instead of a failed gas estimate (Besu reports those as "-32603 internal error").
async function preflight(c, value) {
    const f = await checkFunds(c, value);
    if (!f) return;
    if (!f.enough) {
        throw new Error(
            `${f.isNuru ? "Your Nuru Account" : "Your wallet"} (${shortHash(c.address)}) holds ${toAlke(f.balance)} ALKE, but this payment needs ${toAlke(value)} ALKE` +
            `${f.isNuru ? "" : " plus a little for gas"}. ` +
            (f.isNuru ? "Move ALKE into your Nuru Account (not just the signing key) and try again." : "Top it up and try again.")
        );
    }
    if (f.gasKeyEmpty) {
        throw new Error(`Your Nuru signing key (${shortHash(c.signer)}) has no ALKE to pay gas. Send it a small amount of ALKE and try again.`);
    }
}

// Turns the node's opaque gas-estimate failure into something actionable.
function explainSendError(e) {
    const msg = String(e?.message || e);
    if (/-32603|internal error/i.test(msg)) {
        return new Error(
            "The network rejected this transaction while estimating gas. This usually means the paying account doesn't hold enough ALKE " +
            "(the payment plus a little for gas), or the call would fail. Check your balance and try again."
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
        if (value > 0n) await preflight(c, value);
        try {
            return await send(c, tx, value, label);
        } catch (e) {
            throw explainSendError(e);
        }
    }, [ensureConnected]); // eslint-disable-line react-hooks/exhaustive-deps

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
            // The Nuru browser wraps the call through the Nuru Account itself.
            const hash = await window.ethereum.request({
                method: "eth_sendTransaction",
                params: [{ to: tx.to, data: tx.data || "0x", value: "0x" + value.toString(16) }],
            });
            await waitMined(hash);
            return hash;
        }
        const { getSigner } = await import("../../lib/wallet");
        const signer = await getSigner();
        const sent = await signer.sendTransaction({ to: tx.to, data: tx.data || "0x", value });
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
export function WalletButton() {
    const { conn, openConnect, disconnect } = useWallet();
    const [open, setOpen] = useState(false);
    if (!conn) {
        return <button onClick={() => openConnect().catch(() => { })} className="btn-violet btn-sm py-2">Connect</button>;
    }
    const label = conn.handle || shortHash(conn.address, 4);
    return (
        <div className="relative">
            <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-full border border-line-2 px-3 py-1.5 text-sm hover:border-violet">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {label}
            </button>
            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-line bg-surface p-3 text-sm shadow-xl">
                    <div className="text-xs text-ink-mute">{conn.type === "injected" ? "Browser wallet" : "Nuru Account"}</div>
                    <div className="mt-1 break-all font-mono text-xs">{conn.address}</div>
                    {conn.ain && <div className="mt-1 text-xs text-ink-mute">AIN {conn.ain}</div>}
                    <div className="mt-3 flex gap-2">
                        <Link to={`/address/${conn.address}`} onClick={() => setOpen(false)} className="btn-ghost btn-sm flex-1">View</Link>
                        <button onClick={() => { disconnect(); setOpen(false); }} className="btn-ghost btn-sm flex-1">Disconnect</button>
                    </div>
                </div>
            )}
        </div>
    );
}
