import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CopyIcon, CheckIcon } from "./Icons";

export function CopyButton({ value, className = "" }) {
    const [done, setDone] = useState(false);
    const copy = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1200);
        } catch { }
    };
    return (
        <button
            onClick={copy}
            title="Copy"
            aria-label="Copy to clipboard"
            className={`inline-flex shrink-0 items-center justify-center rounded-md p-1 text-ink-mute transition-colors hover:bg-surface-2 hover:text-accent ${className}`}
        >
            {done ? <CheckIcon className="h-3.5 w-3.5 text-emerald-500" /> : <CopyIcon className="h-3.5 w-3.5" />}
        </button>
    );
}

// Label/value row for detail panels; stacks on narrow screens.
export function Row({ label, children }) {
    return (
        <div className="grid gap-1 border-b border-line py-3 last:border-0 md:grid-cols-12 md:gap-4">
            <div className="text-sm text-ink-mute md:col-span-3">{label}</div>
            <div className="min-w-0 break-all text-sm md:col-span-9">{children}</div>
        </div>
    );
}

export function Mono({ children, className = "" }) {
    return <span className={`font-mono text-[13px] ${className}`}>{children}</span>;
}

// Monospace link to an on-chain entity, with an optional copy button.
export function HashLink({ to, children, copy, className = "" }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1">
            <Link to={to} className={`link font-mono text-[13px] ${className}`}>{children}</Link>
            {copy && <CopyButton value={copy} />}
        </span>
    );
}

export function Tabs({ tabs, active, onChange }) {
    return (
        <div className="flex gap-1 overflow-x-auto border-b border-line px-2">
            {tabs.map((t) => (
                <button
                    key={t.id}
                    onClick={() => onChange(t.id)}
                    className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm transition-colors ${
                        active === t.id ? "border-violet font-medium text-ink" : "border-transparent text-ink-mute hover:text-ink"
                    }`}
                >
                    {t.label}
                    {t.badge}
                </button>
            ))}
        </div>
    );
}

export function Stat({ label, value, sub, icon }) {
    return (
        <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-mute">
                {icon}
                {label}
            </div>
            <div className="mt-2 break-all font-display text-xl font-medium text-ink">{value}</div>
            {sub && <div className="mt-0.5 text-xs text-ink-mute">{sub}</div>}
        </div>
    );
}

export function Empty({ children }) {
    return <p className="px-5 py-8 text-center text-sm text-ink-mute">{children}</p>;
}
