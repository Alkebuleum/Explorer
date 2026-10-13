import React from "react";
import { Link } from "react-router-dom";

export default function Crumbs({ items }) {
    return (
        <nav className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-mute">
            {items.map((it, i) => (
                <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-line-2">/</span>}
                    {it.to ? <Link to={it.to} className="hover:text-accent">{it.label}</Link> : <span className="text-ink-dim">{it.label}</span>}
                </span>
            ))}
        </nav>
    );
}
