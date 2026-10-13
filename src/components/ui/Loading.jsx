import React from "react";

export function Spinner({ className = "h-4 w-4" }) {
    return (
        <span className={`inline-block animate-spin rounded-full border-2 border-violet/30 border-t-violet ${className}`} aria-hidden />
    );
}

export function Skeleton({ className = "h-4 w-full" }) {
    return <span className={`block animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

export default function Loading({ label = "Loading…" }) {
    return (
        <div className="flex items-center gap-2.5 text-sm text-ink-mute">
            <Spinner />
            {label}
        </div>
    );
}
