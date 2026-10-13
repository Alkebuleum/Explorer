import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchIcon } from "./Icons";

// Maps a free-form query to a route, or null if it isn't recognisable.
export function routeForQuery(raw) {
    const v = raw.trim().replace(/,/g, "");
    if (/^0x[a-fA-F0-9]{64}$/.test(v)) return `/tx/${v}`;
    if (/^0x[a-fA-F0-9]{40}$/.test(v)) return `/address/${v}`;
    if (/^[0-9]+$/.test(v)) return `/block/${v}`;
    if (/^\/(tx|address|block)\//.test(v)) return v;
    return null;
}

export default function SearchBar({ size = "lg" }) {
    const [q, setQ] = useState("");
    const [invalid, setInvalid] = useState(false);
    const nav = useNavigate();
    const lg = size === "lg";

    const go = (e) => {
        e.preventDefault();
        const to = routeForQuery(q);
        if (!to) return setInvalid(!!q.trim());
        setQ("");
        nav(to);
    };

    return (
        <form onSubmit={go} className="w-full">
            <div
                className={`flex items-center gap-2 rounded-full border bg-surface transition-colors focus-within:border-violet ${
                    invalid ? "border-rose-500/60" : "border-line-2"
                } ${lg ? "p-1.5 pl-5" : "p-1 pl-3.5"}`}
            >
                <SearchIcon className={`shrink-0 text-ink-mute ${lg ? "h-5 w-5" : "h-4 w-4"}`} />
                <input
                    className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-mute ${lg ? "py-2 text-[15px]" : "py-1 text-sm"}`}
                    placeholder={lg ? "Search by address, transaction hash or block number" : "Address / tx hash / block"}
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setInvalid(false); }}
                    aria-label="Search"
                    spellCheck={false}
                />
                <button type="submit" className={`btn-violet ${lg ? "px-6 py-2.5" : "btn-sm py-1.5"}`}>
                    Search
                </button>
            </div>
            {invalid && (
                <p className="mt-2 pl-5 text-xs text-rose-600 dark:text-rose-300">
                    Enter a 0x… address (40 hex chars), a transaction hash (64 hex chars), or a block number.
                </p>
            )}
        </form>
    );
}
