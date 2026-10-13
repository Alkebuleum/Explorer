import React from "react";

// Alkebuleum hex-shield mark (from alkebuleum.org) with the AlkeScan wordmark.
export function LogoMark({ className = "h-8 w-8" }) {
    return (
        <svg viewBox="0 0 100 110" className={className} aria-hidden>
            <path
                fill="#8b6dff" stroke="#8b6dff" strokeWidth="1" strokeLinejoin="round"
                d="M50,7 L86,28 Q90,30.5 90,35 L90,75 Q90,79.5 86,82 L50,103 L14,82 Q10,79.5 10,75 L10,35 Q10,30.5 14,28 Z"
            />
            <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="50" y1="27" x2="50" y2="83" />
                <polyline points="30,42 42,55 30,68" />
                <polyline points="20,45 29.3,55 20,65" />
                <polyline points="70,42 58,55 70,68" />
                <polyline points="80,45 70.7,55 80,65" />
            </g>
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
