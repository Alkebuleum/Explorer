import React from "react";

export default function Card({ title, actions, children, flush = false, className = "" }) {
    return (
        <section className={`rounded-2xl border border-line bg-surface ${className}`}>
            {(title || actions) && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
                    {title ? <h3 className="font-display text-[15px] font-medium text-ink">{title}</h3> : <span />}
                    {actions}
                </div>
            )}
            <div className={flush ? "" : "p-5"}>{children}</div>
        </section>
    );
}
