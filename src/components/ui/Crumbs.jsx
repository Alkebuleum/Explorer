import React from "react";
import { Link } from "react-router-dom";

export default function Crumbs({ items }) {
    return (
        <nav className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            {items.map((it, i) => (
                <span key={i}>
                    {i > 0 && <span className="mx-2 text-slate-300 dark:text-slate-600">/</span>}
                    {it.to ? <Link to={it.to} className="underline">{it.label}</Link> : <span>{it.label}</span>}
                </span>
            ))}
        </nav>
    );
}
