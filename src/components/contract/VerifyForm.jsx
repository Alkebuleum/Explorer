import React, { useEffect, useMemo, useState } from "react";
import ErrorBanner from "../ui/ErrorBanner";
import { Spinner } from "../ui/Loading";
import {
    EVM_VERSIONS, fetchReleases, parseStandardJson, buildSingleFileInput, describeSettings, verifyContract, detectCompilerVersion,
} from "../../lib/verify";

function Segmented({ value, onChange, options, disabled }) {
    return (
        <div className="inline-flex rounded-full border border-line-2 p-1">
            {options.map(([id, label]) => (
                <button
                    key={id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(id)}
                    className={`rounded-full px-4 py-1.5 text-sm transition-colors ${value === id ? "bg-violet text-white" : "text-ink-dim hover:text-ink"}`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function Field({ label, hint, children }) {
    return (
        <label className="grid gap-1.5">
            <span className="text-sm text-ink-dim">{label}</span>
            {children}
            {hint && <span className="text-xs text-ink-mute">{hint}</span>}
        </label>
    );
}

export default function VerifyForm({ address, onVerified, onCancel }) {
    const [mode, setMode] = useState("json");
    const [releases, setReleases] = useState([]);
    const [releaseErr, setReleaseErr] = useState(null);
    const [version, setVersion] = useState("");
    const [detected, setDetected] = useState(null);

    const [jsonText, setJsonText] = useState("");
    const [jsonName, setJsonName] = useState("");

    const [source, setSource] = useState("");
    const [optimizer, setOptimizer] = useState(true);
    const [runs, setRuns] = useState("200");
    const [evmVersion, setEvmVersion] = useState("");
    const [viaIR, setViaIR] = useState(false);

    const [contractHint, setContractHint] = useState("");
    const [creationTx, setCreationTx] = useState("");

    const [step, setStep] = useState(null);
    const [error, setError] = useState(null);

    // Pre-select the version recorded in the contract's own metadata.
    useEffect(() => {
        Promise.all([fetchReleases(), detectCompilerVersion(address).catch(() => null)])
            .then(([list, found]) => {
                setReleases(list);
                setDetected(found);
                setVersion((v) => v || (found && list.some((r) => r.version === found) ? found : list[0]?.version) || "");
            })
            .catch((e) => setReleaseErr(e.message));
    }, [address]);

    // Parse the Standard JSON as soon as it's provided so problems show early.
    const parsed = useMemo(() => {
        if (mode !== "json" || !jsonText.trim()) return null;
        try {
            return { input: parseStandardJson(jsonText) };
        } catch (e) {
            return { error: e.message };
        }
    }, [mode, jsonText]);

    const onFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setJsonName(f.name);
        setJsonText(await f.text());
    };

    const busy = step != null;
    const canSubmit = !busy && version && (mode === "json" ? parsed?.input : source.trim());

    async function submit(e) {
        e.preventDefault();
        setError(null);
        try {
            const input = mode === "json"
                ? parsed.input
                : buildSingleFileInput({ source, optimizer, runs, evmVersion, viaIR });
            const record = await verifyContract({
                address, input, compilerVersion: version, contractHint, creationTxHash: creationTx, onStep: setStep,
            });
            await onVerified(record);
        } catch (err) {
            setError(err);
        } finally {
            setStep(null);
        }
    }

    const s = parsed?.input ? describeSettings(parsed.input.settings) : null;

    return (
        <form onSubmit={submit} className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-lg font-medium">Verify &amp; publish source code</h3>
                    <p className="text-sm text-ink-mute">The source is compiled in your browser and compared with the bytecode on chain.</p>
                </div>
                <Segmented
                    value={mode}
                    onChange={setMode}
                    disabled={busy}
                    options={[["json", "Standard JSON input"], ["single", "Single file"]]}
                />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Field
                    label="Compiler version"
                    hint={releaseErr || (detected ? `Detected v${detected} from the contract's bytecode.` : "Must exactly match the version used to deploy.")}
                >
                    <select className="field" value={version} onChange={(e) => setVersion(e.target.value)} disabled={busy || !releases.length}>
                        {!releases.length && <option>{releaseErr ? "Unavailable" : "Loading versions…"}</option>}
                        {releases.map((r) => <option key={r.version} value={r.version}>v{r.version}</option>)}
                    </select>
                </Field>
                <Field label="Deployment transaction hash (optional)" hint="Lets us read and show the constructor arguments.">
                    <input className="field font-mono text-[13px]" placeholder="0x…" value={creationTx} onChange={(e) => setCreationTx(e.target.value)} disabled={busy} spellCheck={false} />
                </Field>
            </div>

            {mode === "json" ? (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="btn-ghost cursor-pointer">
                            <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} disabled={busy} />
                            Upload .json file
                        </label>
                        <span className="text-sm text-ink-mute">{jsonName || "or paste it below"}</span>
                    </div>
                    <textarea
                        className="field h-48 font-mono text-xs"
                        placeholder='{ "language": "Solidity", "sources": { … }, "settings": { "optimizer": { … }, "evmVersion": "paris" } }'
                        value={jsonText}
                        onChange={(e) => { setJsonText(e.target.value); setJsonName(""); }}
                        disabled={busy}
                        spellCheck={false}
                    />
                    {parsed?.error && <p className="text-sm text-rose-600 dark:text-rose-300">{parsed.error}</p>}
                    {s && (
                        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-surface-2/60 px-4 py-3 text-xs text-ink-dim">
                            <span>{Object.keys(parsed.input.sources).length} source files</span>
                            <span>Optimizer: {s.optimizer ? `on, ${s.runs} runs` : "off"}</span>
                            <span>EVM: {s.evmVersion}</span>
                            <span>Via IR: {s.viaIR ? "yes" : "no"}</span>
                        </div>
                    )}
                    <p className="text-xs text-ink-mute">
                        Hardhat: <span className="font-mono">artifacts/build-info/*.json</span> → use its <span className="font-mono">input</span> object (the whole file also works).
                        Foundry: <span className="font-mono">forge verify-contract --show-standard-json-input</span>.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Field label="EVM version">
                            <select className="field" value={evmVersion} onChange={(e) => setEvmVersion(e.target.value)} disabled={busy}>
                                <option value="">Compiler default</option>
                                {EVM_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </Field>
                        <Field label="Optimizer runs">
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" className="accent-violet" checked={optimizer} onChange={(e) => setOptimizer(e.target.checked)} disabled={busy} />
                                    Enabled
                                </label>
                                <input className="field w-28" value={runs} onChange={(e) => setRuns(e.target.value)} disabled={busy || !optimizer} />
                            </div>
                        </Field>
                        <Field label="Via IR">
                            <label className="flex h-[38px] items-center gap-2 text-sm">
                                <input type="checkbox" className="accent-violet" checked={viaIR} onChange={(e) => setViaIR(e.target.checked)} disabled={busy} />
                                Compiled with --via-ir
                            </label>
                        </Field>
                    </div>
                    <textarea
                        className="field h-64 font-mono text-xs"
                        placeholder="Paste the full flattened Solidity source (single file, no imports)…"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        disabled={busy}
                        spellCheck={false}
                    />
                </div>
            )}

            <details className="text-sm">
                <summary className="cursor-pointer text-ink-dim">Advanced</summary>
                <div className="mt-3 max-w-md">
                    <Field label="Contract name (optional)" hint='e.g. "AIFToken" or "contracts/AIFToken.sol:AIFToken". Leave blank to try every compiled contract.'>
                        <input className="field font-mono text-[13px]" value={contractHint} onChange={(e) => setContractHint(e.target.value)} disabled={busy} />
                    </Field>
                </div>
            </details>

            {error && (
                <ErrorBanner
                    title={error.message}
                    error={
                        error.compilerErrors ? error.compilerErrors.join("\n\n")
                            : error.compiledNames ? `Compiled contracts: ${error.compiledNames.join(", ") || "none"}.\n\nCheck the compiler version, optimizer runs, EVM version and via-IR setting. They must be exactly the same as the deployment build.`
                                : error.message
                    }
                />
            )}

            <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!canSubmit} className="btn-violet">
                    {busy && <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" />}
                    {busy ? "Verifying…" : "Verify contract"}
                </button>
                {onCancel && <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">Cancel</button>}
                {step && <span className="text-sm text-ink-mute">{step}…</span>}
            </div>
        </form>
    );
}
