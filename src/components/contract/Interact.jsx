import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { RPC_URL, CHAIN_ID, CHAIN_NAME, CHAIN_CURRENCY } from "../../lib/rpc";
import { useWallet } from "../wallet/WalletProvider";
import { shortHash } from "../../lib/format";
import { stringifyAbiValue } from "../../lib/verify";
import { Spinner } from "../ui/Loading";

const readProvider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });

const sig = (fn) => `${fn.name}(${fn.inputs.map((i) => i.type).join(", ")})`;

function coerceInput(param, raw) {
    const v = (raw ?? "").trim();
    if (param.type === "bool") return v === "true" || v === "1";
    if (param.type.endsWith("]") || param.type.startsWith("tuple")) {
        try {
            return JSON.parse(v || "[]");
        } catch {
            throw new Error(`"${param.name || param.type}" must be JSON, e.g. ["0xabc…", "0xdef…"]`);
        }
    }
    return v;
}

function ArgInputs({ inputs, values, onChange, disabled }) {
    if (!inputs.length) return null;
    return (
        <div className="mb-3 grid gap-2">
            {inputs.map((inp, i) => (
                <label key={i} className="grid gap-1">
                    <span className="text-xs text-ink-mute">{inp.name || `arg${i}`} <span className="font-mono">({inp.type})</span></span>
                    <input
                        className="field font-mono text-[13px]"
                        placeholder={inp.type}
                        value={values[i] ?? ""}
                        onChange={(e) => onChange(i, e.target.value)}
                        disabled={disabled}
                        spellCheck={false}
                    />
                </label>
            ))}
        </div>
    );
}

function FnShell({ index, fn, children }) {
    return (
        <details className="group rounded-xl border border-line bg-surface open:border-line-2">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm">
                <span className="w-6 text-right font-mono text-xs text-ink-mute">{index + 1}.</span>
                <span className="font-mono text-[13px]">{fn.name}</span>
                {fn.stateMutability === "payable" && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">payable</span>}
                <span className="ml-auto text-ink-mute transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="border-t border-line px-4 py-4">{children}</div>
        </details>
    );
}

function ReadFunction({ index, address, abi, fn }) {
    const [values, setValues] = useState(fn.inputs.map(() => ""));
    const [result, setResult] = useState(null);
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(false);

    const run = async () => {
        setLoading(true); setErr(null); setResult(null);
        try {
            const contract = new ethers.Contract(address, abi, readProvider);
            const args = fn.inputs.map((inp, i) => coerceInput(inp, values[i]));
            const res = await contract.getFunction(ethers.FunctionFragment.from(fn)).staticCallResult(...args);
            setResult(fn.outputs.map((o, i) => ({ name: o.name, type: o.type, value: stringifyAbiValue(res[i]) })));
        } catch (e) {
            setErr(e.reason || e.shortMessage || e.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <FnShell index={index} fn={fn}>
            <ArgInputs inputs={fn.inputs} values={values} onChange={(i, v) => setValues((vs) => vs.map((x, idx) => (idx === i ? v : x)))} />
            <button onClick={run} disabled={loading} className="btn-ghost btn-sm">
                {loading && <Spinner className="h-3 w-3" />}Query
            </button>
            {result && (
                <div className="mt-3 space-y-1 rounded-lg bg-surface-2 p-3">
                    {result.map((r, i) => (
                        <div key={i} className="break-all font-mono text-[13px]">
                            <span className="text-ink-mute">{r.name || `[${i}]`} <span className="text-xs">{r.type}</span>: </span>
                            {r.type === "address" ? <Link to={`/address/${r.value}`} className="link">{r.value}</Link> : r.value}
                        </div>
                    ))}
                </div>
            )}
            {err && <div className="mt-3 text-sm text-rose-600 dark:text-rose-300">{err}</div>}
        </FnShell>
    );
}

function WriteFunction({ index, address, abi, fn, send }) {
    const [values, setValues] = useState(fn.inputs.map(() => ""));
    const [nativeValue, setNativeValue] = useState("");
    const [txHash, setTxHash] = useState(null);
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(false);

    const run = async () => {
        setLoading(true); setErr(null); setTxHash(null);
        try {
            const args = fn.inputs.map((inp, i) => coerceInput(inp, values[i]));
            const data = new ethers.Interface([fn]).encodeFunctionData(ethers.FunctionFragment.from(fn), args);
            const value = fn.stateMutability === "payable" && nativeValue ? ethers.parseEther(nativeValue) : 0n;
            setTxHash(await send({ to: address, data, value }, `Call ${fn.name}`));
        } catch (e) {
            setErr(e.reason || e.shortMessage || e.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <FnShell index={index} fn={fn}>
            <ArgInputs inputs={fn.inputs} values={values} onChange={(i, v) => setValues((vs) => vs.map((x, idx) => (idx === i ? v : x)))} />
            {fn.stateMutability === "payable" && (
                <label className="mb-3 grid gap-1">
                    <span className="text-xs text-ink-mute">Value to send ({CHAIN_CURRENCY})</span>
                    <input className="field font-mono text-[13px]" placeholder="0.0" value={nativeValue} onChange={(e) => setNativeValue(e.target.value)} />
                </label>
            )}
            <button onClick={run} disabled={loading} className="btn-violet btn-sm">
                {loading && <Spinner className="h-3 w-3 border-white/40 border-t-white" />}Write
            </button>
            {txHash && (
                <div className="mt-3 text-sm">
                    Submitted: <Link to={`/tx/${txHash}`} className="link font-mono text-[13px]">{shortHash(txHash, 10)}</Link>
                </div>
            )}
            {err && <div className="mt-3 text-sm text-rose-600 dark:text-rose-300">{err}</div>}
        </FnShell>
    );
}

export function ReadPanel({ address, abi }) {
    const fns = abi.filter((f) => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure"));
    if (!fns.length) return <p className="text-sm text-ink-mute">This contract has no read functions.</p>;
    return <div className="grid gap-2">{fns.map((fn, i) => <ReadFunction key={sig(fn)} index={i} address={address} abi={abi} fn={fn} />)}</div>;
}

export function WritePanel({ address, abi }) {
    const { conn, openConnect, sendTransaction } = useWallet();
    const fns = abi.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure");

    if (!fns.length) return <p className="text-sm text-ink-mute">This contract has no write functions.</p>;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm">
                <span className={`h-2 w-2 rounded-full ${conn ? "bg-emerald-400" : "bg-ink-mute"}`} />
                {conn ? (
                    <span>Connected: <span className="font-mono text-[13px]">{conn.handle || shortHash(conn.address, 6)}</span> on {CHAIN_NAME}</span>
                ) : (
                    <>
                        <span className="text-ink-dim">Connect Nuru or a browser wallet to send transactions.</span>
                        <button onClick={() => openConnect().catch(() => { })} className="btn-violet btn-sm ml-auto">Connect wallet</button>
                    </>
                )}
            </div>
            <div className="grid gap-2">{fns.map((fn, i) => <WriteFunction key={sig(fn)} index={i} address={address} abi={abi} fn={fn} send={sendTransaction} />)}</div>
        </div>
    );
}
