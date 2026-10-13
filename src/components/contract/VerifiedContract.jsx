import React, { useState } from "react";
import Badge from "../ui/Badge";
import { CopyButton, Tabs } from "../ui/Bits";
import { ShieldCheckIcon, DownloadIcon } from "../ui/Icons";
import CodeViewer from "./CodeViewer";
import { ReadPanel, WritePanel } from "./Interact";
import PublishBar from "./PublishBar";
import { describeSettings, toStandardJson } from "../../lib/verify";

function download(filename, obj) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function Fact({ label, children }) {
    return (
        <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-ink-mute">{label}</div>
            <div className="mt-1 truncate font-mono text-[13px] text-ink">{children}</div>
        </div>
    );
}

export default function VerifiedContract({ address, record, onPublished }) {
    const [tab, setTab] = useState("code");
    const s = describeSettings(record.settings);
    const hasRead = record.abi.some((f) => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure"));
    const hasWrite = record.abi.some((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure");
    const abiJson = JSON.stringify(record.abi, null, 2);

    const tabs = [
        { id: "code", label: "Code" },
        hasRead && { id: "read", label: "Read contract" },
        hasWrite && { id: "write", label: "Write contract" },
        { id: "abi", label: "ABI" },
    ].filter(Boolean);

    return (
        <div>
            <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="success" icon={<ShieldCheckIcon className="h-3.5 w-3.5" />}>
                        Verified · {record.matchType === "full" ? "Exact match" : "Partial match"}
                    </Badge>
                    <button
                        onClick={() => download(`${record.contractName}-${address.slice(0, 8)}-standard-input.json`, toStandardJson(record))}
                        className="btn-ghost btn-sm ml-auto"
                    >
                        <DownloadIcon className="h-3.5 w-3.5" />Standard JSON
                    </button>
                </div>
                {record.storage === "session" && <PublishBar record={record} onPublished={onPublished} />}
                {record.matchType === "partial" && (
                    <p className="text-xs text-ink-mute">
                        Partial match: the executable bytecode is identical, but the embedded metadata hash differs
                        (usually comments, whitespace or file paths changed after deployment).
                    </p>
                )}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-surface-2/50 p-4 sm:grid-cols-3 lg:grid-cols-6">
                    <Fact label="Contract">{record.contractName}</Fact>
                    <Fact label="Compiler">v{record.compilerVersion}</Fact>
                    <Fact label="EVM version">{s.evmVersion}</Fact>
                    <Fact label="Optimizer">{s.optimizer ? `Yes, ${s.runs} runs` : "No"}</Fact>
                    <Fact label="Via IR">{s.viaIR ? "Yes" : "No"}</Fact>
                    <Fact label="Verified">{new Date(record.verifiedAt).toLocaleDateString()}</Fact>
                </div>
                {record.constructorArgs && (
                    <details className="rounded-xl border border-line px-4 py-3 text-sm">
                        <summary className="cursor-pointer text-ink-dim">
                            Constructor arguments {record.constructorArgs.decoded.length ? `(${record.constructorArgs.decoded.length})` : "(none)"}
                        </summary>
                        <div className="mt-3 space-y-1.5">
                            {record.constructorArgs.decoded.map((a, i) => (
                                <div key={i} className="break-all font-mono text-[13px]">
                                    <span className="text-ink-mute">{a.name || `arg${i}`} <span className="text-xs">{a.type}</span>: </span>{a.value}
                                </div>
                            ))}
                            {record.constructorArgs.hex && (
                                <div className="flex items-start gap-1 pt-2">
                                    <pre className="max-h-32 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-2 font-mono text-xs text-ink-dim">{record.constructorArgs.hex}</pre>
                                    <CopyButton value={record.constructorArgs.hex} />
                                </div>
                            )}
                        </div>
                    </details>
                )}
                {record.constructorArgsError && (
                    <p className="text-xs text-gold">Constructor arguments not checked: {record.constructorArgsError}</p>
                )}
            </div>

            <Tabs tabs={tabs} active={tab} onChange={setTab} />
            <div className="p-5">
                {tab === "code" && <CodeViewer sources={record.sources} mainPath={record.sourcePath} />}
                {tab === "read" && <ReadPanel address={address} abi={record.abi} />}
                {tab === "write" && <WritePanel address={address} abi={record.abi} />}
                {tab === "abi" && (
                    <div className="relative">
                        <div className="absolute right-2 top-2"><CopyButton value={abiJson} /></div>
                        <pre className="max-h-[580px] overflow-auto rounded-xl border border-line bg-surface-2/50 p-4 font-mono text-xs text-ink-dim">{abiJson}</pre>
                    </div>
                )}
            </div>
        </div>
    );
}
