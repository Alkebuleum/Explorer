import React, { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Topbar() {
    const toggle = () => {
        const root = document.documentElement;
        const newVal = !root.classList.contains("dark");
        root.classList.toggle("dark", newVal);
        try {
            localStorage.setItem("theme", newVal ? "dark" : "light");
        } catch { }
    };

    useEffect(() => {
        try {
            const saved = localStorage.getItem("theme");
            if (saved) {
                document.documentElement.classList.toggle("dark", saved === "dark");
            } else if (
                window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: dark)").matches
            ) {
                document.documentElement.classList.add("dark");
            }
        } catch { }
    }, []);

    return (
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur dark:bg-black/40 dark:border-white/10">
            <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3">
                <Link
                    to="/"
                    className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent"
                >
                    Alkebuleum Explorer
                </Link>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={toggle}
                        className="h-8 rounded-lg border border-slate-200 px-3 text-sm font-medium hover:bg-slate-100 transition-colors dark:border-white/10 dark:hover:bg-white/5"
                        title="Toggle theme"
                    >
                        Theme
                    </button>
                </div>
            </div>
        </header>
    );
}
