import React from "react";
export default function Loading({ label = "Loading…" }) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>;
}
