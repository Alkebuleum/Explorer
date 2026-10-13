import React, { useMemo, useState } from "react";
import { CopyButton } from "../ui/Bits";
import { FileIcon } from "../ui/Icons";

// Puts the verified contract's own file first, then project files, then
// dependencies (node_modules / @openzeppelin etc.).
function orderFiles(paths, mainPath) {
    const isDep = (p) => /(^|\/)(node_modules|lib)\//.test(p) || p.startsWith("@");
    return [...paths].sort((a, b) => {
        if (a === mainPath) return -1;
        if (b === mainPath) return 1;
        if (isDep(a) !== isDep(b)) return isDep(a) ? 1 : -1;
        return a.localeCompare(b);
    });
}

export default function CodeViewer({ sources, mainPath }) {
    const files = useMemo(() => orderFiles(Object.keys(sources), mainPath), [sources, mainPath]);
    const [active, setActive] = useState(files[0]);
    const content = sources[active] ?? "";
    const lines = useMemo(() => content.split("\n"), [content]);

    return (
        <div className="overflow-hidden rounded-xl border border-line md:grid md:grid-cols-[260px_1fr]">
            <div className="max-h-48 overflow-auto border-b border-line bg-surface-2/50 md:max-h-[620px] md:border-b-0 md:border-r">
                <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-ink-mute">{files.length} file{files.length === 1 ? "" : "s"}</div>
                {files.map((p) => (
                    <button
                        key={p}
                        onClick={() => setActive(p)}
                        title={p}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                            p === active ? "bg-violet/15 text-ink" : "text-ink-dim hover:bg-surface-2"
                        }`}
                    >
                        <FileIcon className={`h-3.5 w-3.5 shrink-0 ${p === mainPath ? "text-accent" : "text-ink-mute"}`} />
                        <span className="truncate font-mono">{p.split("/").pop()}</span>
                    </button>
                ))}
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                    <span className="truncate font-mono text-xs text-ink-dim">{active}</span>
                    <span className="ml-auto text-xs text-ink-mute">{lines.length} lines</span>
                    <CopyButton value={content} />
                </div>
                <div className="max-h-[580px] overflow-auto bg-surface">
                    <table className="w-full border-collapse font-mono text-[12.5px] leading-5">
                        <tbody>
                            {lines.map((l, i) => (
                                <tr key={i}>
                                    <td className="select-none border-r border-line px-3 text-right align-top text-ink-mute">{i + 1}</td>
                                    <td className="whitespace-pre px-4 text-ink">{l || " "}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
