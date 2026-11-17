import React from "react";

// AlkeScan mark: the Alke block inside scanner corners with a scan line
// (its own mark, not the Alkebuleum shield, so it reads apart from the other
// Alke apps). The corners follow the text colour (light and dark themes).
export function LogoMark({ className = "h-8 w-8" }) {
    return (
        <svg viewBox="0 0 100 100" className={`${className} text-ink`} aria-hidden>
            <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 30 V16 a6 6 0 0 1 6 -6 H30" />
                <path d="M70 10 H84 a6 6 0 0 1 6 6 V30" />
                <path d="M90 70 V84 a6 6 0 0 1 -6 6 H70" />
                <path d="M30 90 H16 a6 6 0 0 1 -6 -6 V70" />
            </g>
            <path d="M50 24 L72 37 L72 63 L50 76 L28 63 L28 37 Z" fill="#7556FF" />
            <path d="M50 24 L72 37 L50 50 L28 37 Z" fill="#9B85FF" />
            <path d="M50 50 L50 76" stroke="#5A3BE8" strokeWidth="2" />
            <rect x="18" y="47" width="64" height="6" rx="3" fill="#14C8E0" />
        </svg>
    );
}

export default function Logo() {
    return (
        <span className="flex items-center gap-2.5">
            <LogoMark />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">
                Alke<span className="text-accent">Scan</span>
            </span>
        </span>
    );
}
