import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import Card from "../components/ui/Card";
import ErrorBanner from "../components/ui/ErrorBanner";
import Loading, { Spinner } from "../components/ui/Loading";
import TokenLogo from "../components/ui/TokenLogo";
import { rpc, CHAIN_CURRENCY } from "../lib/rpc";
import { formatUnits } from "../lib/format";
import { probeErc20 } from "../lib/erc20";
import { getRegistryToken, refreshRegistry } from "../lib/tokenRegistry";
import { useWallet } from "../components/wallet/WalletProvider";
import PayerBalance from "../components/wallet/PayerBalance";
import {
    REGISTRY_FEE_ALKE, REGISTRY_TREASURY, payRegistryFee, submitRegistration, loadPendingPayment,
} from "../lib/registerToken";

const isUrlOrEmpty = (v) => !v.trim() || /^https:\/\/[^\s/]+\.[^\s]+$/i.test(v.trim());

function Field({ label, hint, children }) {
    return (
        <label className="grid gap-1.5">
            <span className="text-sm text-ink-dim">{label}</span>
            {children}
            {hint && <span className="text-xs text-ink-mute">{hint}</span>}
        </label>
    );
}

export default function RegisterTokenPage() {
    const [params] = useSearchParams();
    const [address, setAddress] = useState(params.get("token") || "");
    const [lookup, setLookup] = useState({ status: "idle" }); // idle | loading | token | listed | notToken
    const [description, setDescription] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [website, setWebsite] = useState("");
    const { conn, ensureConnected, sendTransaction } = useWallet();
    const [resumeTx, setResumeTx] = useState("");
    const [step, setStep] = useState(null);
    const [err, setErr] = useState(null);
    const [done, setDone] = useState(false);

    // Lowercase first: mixed-case input with a bad checksum is still a valid address.
    const clean = address.trim().toLowerCase();
    const valid = ethers.isAddress(clean);

    // Read the token from chain + check whether it's already listed.
    useEffect(() => {
        if (!valid) { setLookup({ status: "idle" }); return; }
        const a = ethers.getAddress(clean);
        let live = true;
        setLookup({ status: "loading" });
        (async () => {
            const [code, listed] = await Promise.all([rpc("eth_getCode", [a, "latest"]).catch(() => "0x"), getRegistryToken(a)]);
            if (!live) return;
            if (listed) return setLookup({ status: "listed", listed });
            const token = code && code !== "0x" ? await probeErc20(a).catch(() => null) : null;
            if (!live) return;
            setLookup(token ? { status: "token", token, address: a } : { status: "notToken" });
            setResumeTx(loadPendingPayment(a));
        })();
        return () => { live = false; };
    }, [clean, valid]);

    const token = lookup.status === "token" ? lookup.token : null;
    const formOk = token && description.trim().length >= 10 && isUrlOrEmpty(logoUrl) && isUrlOrEmpty(website);
    const busy = step != null;

    async function register(e) {
        e.preventDefault();
        setErr(null);
        try {
            let paymentTxHash = resumeTx.trim();
            let ownerWallet;
            if (paymentTxHash) {
                // Resuming: the listing belongs to whoever paid the fee. A
                // direct payment goes to the treasury; a Nuru Account payment
                // is a call *to* the Nuru Account, which is the payer.
                const tx = await rpc("eth_getTransactionByHash", [paymentTxHash]);
                if (!tx) throw new Error("Payment transaction not found.");
                ownerWallet = conn?.address
                    || (tx.to && tx.to.toLowerCase() !== REGISTRY_TREASURY.toLowerCase() ? tx.to : tx.from);
            } else {
                ownerWallet = (await ensureConnected()).address;
                setStep(`Approve the ${REGISTRY_FEE_ALKE.toLocaleString()} ${CHAIN_CURRENCY} fee in your wallet…`);
                paymentTxHash = await payRegistryFee(lookup.address, sendTransaction);
                setResumeTx(paymentTxHash);
            }
            setStep("Payment sent. Submitting to the registry…");
            await submitRegistration({
                paymentTxHash,
                tokenAddress: lookup.address,
                ownerWallet,
                token: {
                    name: token.name || token.symbol,
                    symbol: token.symbol.toUpperCase(),
                    decimals: token.decimals,
                    description: description.trim(),
                    logoUrl: logoUrl.trim(),
                    website: website.trim(),
                    ownerAin: conn?.ain || null,
                },
                onProgress: setStep,
            });
            refreshRegistry();
            setDone(true);
        } catch (e2) {
            setErr(e2.shortMessage || e2.reason || e2.message || String(e2));
        } finally {
            setStep(null);
        }
    }

    if (done) {
        return (
            <div className="mx-auto max-w-xl py-10 text-center">
                <div className="eyebrow">Registered</div>
                <h1 className="mt-3 text-3xl font-medium">{token.symbol} is listed</h1>
                <p className="mt-2 text-ink-dim">It now appears in the Alkebuleum token registry on AlkeScan, JollofSwap and Nuru. It may take a minute to show up everywhere.</p>
                <div className="mt-6 flex justify-center gap-2">
                    <Link to={`/address/${lookup.address}`} className="btn-violet">View token</Link>
                    <Link to="/tokens" className="btn-ghost">All tokens</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div>
                <div className="eyebrow">Token registry</div>
                <h1 className="mt-2 text-2xl font-medium sm:text-3xl">Register your token</h1>
                <p className="mt-1 text-sm text-ink-dim">
                    List an ERC-20 token in the Alkebuleum ecosystem registry. Listed tokens show their profile on AlkeScan
                    and appear in JollofSwap and Nuru. The listing fee is{" "}
                    <span className="font-medium text-ink">{REGISTRY_FEE_ALKE.toLocaleString()} {CHAIN_CURRENCY}</span>.
                </p>
            </div>

            <Card>
                <form onSubmit={register} className="space-y-5">
                    <Field label="Token contract address">
                        <input className="field font-mono text-[13px]" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} spellCheck={false} />
                    </Field>

                    {lookup.status === "loading" && <Loading label="Reading token from chain…" />}
                    {lookup.status === "notToken" && <p className="text-sm text-rose-600 dark:text-rose-300">No ERC-20 token at this address on Alkebuleum.</p>}
                    {lookup.status === "listed" && (
                        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-4 text-sm">
                            <TokenLogo token={lookup.listed} />
                            <div className="flex-1"><span className="font-medium">{lookup.listed.name}</span> is already registered ({lookup.listed.status}).</div>
                            <Link to={`/address/${lookup.listed.address}`} className="btn-ghost btn-sm">View</Link>
                        </div>
                    )}

                    {token && (
                        <>
                            <div className="grid grid-cols-3 gap-4 rounded-xl border border-line bg-surface-2/60 p-4 text-sm">
                                <div><div className="text-[11px] uppercase tracking-wider text-ink-mute">Name</div><div className="mt-1 font-medium">{token.name || "—"}</div></div>
                                <div><div className="text-[11px] uppercase tracking-wider text-ink-mute">Symbol</div><div className="mt-1 font-medium">{token.symbol}</div></div>
                                <div><div className="text-[11px] uppercase tracking-wider text-ink-mute">Supply</div><div className="mt-1 truncate font-mono text-[13px]">{formatUnits(token.totalSupply, token.decimals, 2)}</div></div>
                                <p className="col-span-3 text-xs text-ink-mute">Name and symbol are read from the contract on chain.</p>
                            </div>
                            <Field label="Description" hint="At least 10 characters. Shown on the token's page.">
                                <textarea className="field h-24" value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} maxLength={500} />
                            </Field>
                            <div className="grid items-start gap-4 sm:grid-cols-2">
                                <Field label="Logo URL (optional)" hint={!isUrlOrEmpty(logoUrl) ? "Must be an https:// link" : "Square PNG or SVG, https:// link"}>
                                    <input className="field" placeholder="https://…/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={busy} />
                                </Field>
                                <Field label="Website (optional)" hint={!isUrlOrEmpty(website) ? "Must be an https:// link" : null}>
                                    <input className="field" placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={busy} />
                                </Field>
                            </div>

                            <details className="text-sm" open={!!resumeTx}>
                                <summary className="cursor-pointer text-ink-dim">Already paid the fee?</summary>
                                <div className="mt-3">
                                    <Field label="Fee payment transaction hash" hint="Resume a registration without paying again.">
                                        <input className="field font-mono text-[13px]" placeholder="0x…" value={resumeTx} onChange={(e) => setResumeTx(e.target.value)} disabled={busy} spellCheck={false} />
                                    </Field>
                                </div>
                            </details>

                            {err && <ErrorBanner title="Registration didn't complete" error={err} />}

                            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                                <button type="submit" disabled={!formOk || busy} className="btn-violet">
                                    {busy && <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />}
                                    {resumeTx.trim() ? "Resume registration" : `Pay ${REGISTRY_FEE_ALKE.toLocaleString()} ${CHAIN_CURRENCY} & register`}
                                </button>
                                {!busy && !resumeTx.trim() && (conn
                                    ? <PayerBalance feeAlke={REGISTRY_FEE_ALKE} />
                                    : <span className="text-xs text-ink-mute">You'll connect Nuru or a browser wallet to pay.</span>)}
                                {step && <span className="text-sm text-ink-mute">{step}</span>}
                            </div>
                        </>
                    )}
                </form>
            </Card>
        </div>
    );
}
