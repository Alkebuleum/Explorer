import React from "react";

const TONES = {
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    warn: "border-gold/40 bg-gold/10 text-[#8a6620] dark:text-gold",
    violet: "border-violet/40 bg-violet/10 text-violet-deep dark:text-lavender",
    neutral: "border-line-2 bg-surface-2 text-ink-dim",
};

export default function Badge({ tone = "neutral", icon, children }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
            {icon}
            {children}
        </span>
    );
}
