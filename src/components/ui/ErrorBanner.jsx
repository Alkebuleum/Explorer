import React from "react";

export default function ErrorBanner({ error, details, title = "Something went wrong" }) {
    if (!error) return null;
    const copy = () =>
        navigator.clipboard?.writeText(details ? JSON.stringify(details, null, 2) : String(error));
    return (
        <div className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-800 dark:text-rose-200">
            <div className="font-medium">{title}</div>
            <div className="mt-1 whitespace-pre-wrap break-words">{String(error)}</div>
            <div className="mt-2 flex items-center gap-3 text-xs">
                {details && (
                    <details>
                        <summary className="cursor-pointer">Details</summary>
                        <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-black/5 p-2 dark:bg-white/5">
                            {JSON.stringify(details, null, 2)}
                        </pre>
                    </details>
                )}
                <button onClick={copy} className="underline">Copy</button>
            </div>
        </div>
    );
}
