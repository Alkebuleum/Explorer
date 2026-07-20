import React from "react";

export default function ErrorBanner({ error, details }) {
    if (!error) return null;
    const copy = () =>
        navigator.clipboard?.writeText(details ? JSON.stringify(details, null, 2) : String(error));
    return (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/40 dark:text-rose-300">
            <div className="font-medium">Something went wrong</div>
            <div className="mt-1">{String(error)}</div>
            {details && (
                <details className="mt-1">
                    <summary className="cursor-pointer">details</summary>
                    <pre className="mt-1 overflow-auto rounded bg-white/70 p-2 text-xs dark:bg-white/5">
                        {JSON.stringify(details, null, 2)}
                    </pre>
                </details>
            )}
            <button onClick={copy} className="mt-2 underline">Copy</button>
        </div>
    );
}
