import React from "react";

export default function Card({ title, actions, children }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:bg-black dark:border-white/10">
            {(title || actions) && (
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100/80 dark:border-white/5">
                    {title ? <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</h3> : <span />}
                    {actions}
                </div>
            )}
            <div className="p-5">{children}</div>
        </section>
    );
}
