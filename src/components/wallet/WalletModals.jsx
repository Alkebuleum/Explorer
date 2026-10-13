// Wallet dialogs (connect + Nuru approval QR). Split out of WalletProvider so
// the QR, Nuru and ethers code only load when someone actually connects.
import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Spinner } from "../ui/Loading";
import { LogoMark } from "../layout/Logo";
import { connectWallet, hasWallet } from "../../lib/wallet";
import { CHAIN_NAME } from "../../lib/rpc";
import { nuruConnect, nuruInjected, nuruBrowserConnect, NURU_PLAY_STORE } from "../../lib/nuru";

function Modal({ title, subtitle, onClose, children }) {
    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
            <div className="w-full max-w-sm rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                        <div className="font-display text-lg font-medium">{title}</div>
                        {subtitle && <div className="text-sm text-ink-mute">{subtitle}</div>}
                    </div>
                    {onClose && <button onClick={onClose} aria-label="Close" className="rounded-full px-2 text-xl leading-none text-ink-mute hover:text-ink">×</button>}
                </div>
                {children}
            </div>
        </div>
    );
}

function QrBox({ uri }) {
    return (
        <div className="mx-auto w-fit rounded-xl bg-white p-3">
            <QRCodeSVG value={uri} size={200} bgColor="#ffffff" fgColor="#0A0A0B" level="M" />
        </div>
    );
}

export function ConnectModal({ onConnected, onClose }) {
    const [uri, setUri] = useState(null);
    const [busy, setBusy] = useState(null); // "nuru" | "injected"
    const [err, setErr] = useState(null);
    const inNuru = !!nuruInjected();

    const run = async (kind, fn) => {
        setErr(null);
        setBusy(kind);
        try {
            onConnected(await fn());
        } catch (e) {
            setErr(e.shortMessage || e.message || String(e));
            setUri(null);
        } finally {
            setBusy(null);
        }
    };

    return (
        <Modal title="Connect wallet" subtitle={`to ${CHAIN_NAME}`} onClose={onClose}>
            {inNuru ? (
                <button onClick={() => run("nuru", nuruBrowserConnect)} disabled={!!busy} className="btn-violet w-full">
                    {busy && <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />}Connect Nuru
                </button>
            ) : uri ? (
                <div className="space-y-3 text-center">
                    <QrBox uri={uri} />
                    <p className="text-sm text-ink-dim">Open <span className="font-medium text-ink">Nuru</span> on your phone, tap scan, then approve.</p>
                    <p className="flex items-center justify-center gap-2 text-xs text-ink-mute"><Spinner className="h-3 w-3" />Waiting for Nuru…</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <button onClick={() => run("nuru", () => nuruConnect(setUri))} disabled={!!busy} className="flex w-full items-center gap-3 rounded-xl border border-line-2 p-3 text-left transition-colors hover:border-violet">
                        <LogoMark className="h-8 w-8" />
                        <span className="flex-1">
                            <span className="block font-medium">Nuru</span>
                            <span className="block text-xs text-ink-mute">Scan a QR code with the Nuru app</span>
                        </span>
                        {busy === "nuru" && <Spinner />}
                    </button>
                    <button onClick={() => run("injected", async () => ({ type: "injected", address: await connectWallet() }))} disabled={!!busy || !hasWallet()} className="flex w-full items-center gap-3 rounded-xl border border-line-2 p-3 text-left transition-colors hover:border-violet disabled:opacity-40">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-lg">🦊</span>
                        <span className="flex-1">
                            <span className="block font-medium">Browser wallet</span>
                            <span className="block text-xs text-ink-mute">{hasWallet() ? "MetaMask or another installed wallet" : "None detected in this browser"}</span>
                        </span>
                        {busy === "injected" && <Spinner />}
                    </button>
                    <p className="pt-2 text-center text-xs text-ink-mute">
                        Don't have Nuru? <a href={NURU_PLAY_STORE} target="_blank" rel="noreferrer" className="link">Get it on Google Play</a>
                    </p>
                </div>
            )}
            {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{err}</p>}
        </Modal>
    );
}

export function SignModal({ uri, label }) {
    return (
        <Modal title={label} subtitle="Scan with Nuru to approve">
            <div className="space-y-3 text-center">
                <QrBox uri={uri} />
                <p className="flex items-center justify-center gap-2 text-xs text-ink-mute"><Spinner className="h-3 w-3" />Waiting for approval in Nuru…</p>
            </div>
        </Modal>
    );
}
