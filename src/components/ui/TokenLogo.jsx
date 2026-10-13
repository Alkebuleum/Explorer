import React, { useState } from "react";

// Registry logo, falling back to a lettered disc when missing or broken.
export default function TokenLogo({ token, size = "h-8 w-8" }) {
    const [broken, setBroken] = useState(false);
    if (token.logoUrl && !broken) {
        return (
            <img
                src={token.logoUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setBroken(true)}
                className={`${size} shrink-0 rounded-full bg-surface-2 object-cover`}
            />
        );
    }
    return (
        <span className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-violet/15 font-display text-xs font-semibold text-accent`}>
            {token.symbol.slice(0, 3)}
        </span>
    );
}
