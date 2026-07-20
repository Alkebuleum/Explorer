import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SearchBar() {
    const [q, setQ] = useState("");
    const nav = useNavigate();

    const go = () => {
        const v = q.trim().replace(/,/g, "");
        if (!v) return;
        if (/^0x[a-fA-F0-9]{64}$/.test(v)) return nav(`/tx/${v}`);
        if (/^0x[a-fA-F0-9]{40}$/.test(v)) return nav(`/address/${v}`);
        if (/^[0-9]+$/.test(v)) return nav(`/block/${v}`);
        if (v.startsWith("/tx/0x")) return nav(v);
        if (v.startsWith("/address/0x")) return nav(v);
        if (v.startsWith("/block/")) return nav(v);
        setQ("");
    };

    return (
        <div className="flex gap-2">
            <input
                className="flex-1 h-11 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none focus:border-slate-400 dark:bg-transparent dark:border-white/10 dark:text-slate-100"
                placeholder="Block #, tx hash, or address…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && go()}
            />
            <button
                onClick={go}
                className="h-11 rounded-full bg-slate-900 px-5 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
                Search
            </button>
        </div>
    );
}
