import React, { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Logo, { LogoMark } from "./Logo";
import SearchBar from "../ui/SearchBar";
import { SunIcon, MoonIcon, ExternalIcon } from "../ui/Icons";
import { useChainHead, useTick } from "../../lib/hooks";
import { timeAgo } from "../../lib/format";
import { CHAIN_ID } from "../../lib/rpc";
import { WalletButton } from "../wallet/WalletProvider";

function ThemeToggle() {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
    const toggle = () => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { }
        setDark(next);
    };
    return (
        <button
            onClick={toggle}
            title={dark ? "Switch to light theme" : "Switch to dark theme"}
            aria-label="Toggle theme"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-2 text-ink-dim transition-colors hover:border-violet hover:text-accent"
        >
            {dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>
    );
}

function NetworkPill({ head }) {
    useTick(1000);
    return (
        <Link
            to={head.number != null ? `/block/${head.number}` : "/"}
            className="hidden items-center gap-2 rounded-full border border-line-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-violet sm:inline-flex"
            title="Latest block"
        >
            <span className={`h-1.5 w-1.5 rounded-full ${head.number != null ? "animate-pulse-dot bg-emerald-400" : "bg-ink-mute"}`} />
            Mainnet
            <span className="text-ink-mute">·</span>
            <span className="text-ink">{head.number != null ? `#${head.number.toLocaleString()}` : "…"}</span>
            <span className="hidden text-ink-mute lg:inline">{head.ts ? timeAgo(head.ts) : ""}</span>
        </Link>
    );
}

const navCls = ({ isActive }) =>
    `rounded-full px-3 py-1.5 text-sm transition-colors ${isActive ? "text-ink" : "text-ink-mute hover:text-ink"}`;

function Header({ head }) {
    const { pathname } = useLocation();
    const isHome = pathname === "/";
    return (
        <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
                <Link to="/" aria-label="AlkeScan home"><Logo /></Link>
                <nav className="ml-2 hidden items-center md:flex">
                    <NavLink to="/" end className={navCls}>Explorer</NavLink>
                    <NavLink to="/tokens" className={navCls}>Tokens</NavLink>
                    <a href="https://docs.alkebuleum.org" target="_blank" rel="noreferrer" className={navCls({})}>Docs</a>
                    <a href="https://alkebuleum.org" target="_blank" rel="noreferrer" className={navCls({})}>Alkebuleum</a>
                </nav>
                {!isHome && (
                    <div className="hidden max-w-md flex-1 lg:block">
                        <SearchBar size="sm" />
                    </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <NetworkPill head={head} />
                    <WalletButton />
                    <ThemeToggle />
                </div>
            </div>
            {!isHome && (
                <div className="border-t border-line px-4 py-2 lg:hidden">
                    <SearchBar size="sm" />
                </div>
            )}
        </header>
    );
}

function Footer() {
    const links = [
        ["Alkebuleum", "https://alkebuleum.org"],
        ["Docs", "https://docs.alkebuleum.org"],
        ["Network", "https://alkebuleum.org/network"],
        ["GitHub", "https://github.com/alkebuleum"],
        ["X / Twitter", "https://twitter.com/alkebuleum"],
        ["Telegram", "https://t.me/alkebuleum"],
    ];
    return (
        <footer className="mt-16 border-t border-line">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-sm">
                    <div className="flex items-center gap-2.5">
                        <LogoMark className="h-7 w-7" />
                        <span className="font-display text-lg font-semibold">Alke<span className="text-accent">Scan</span></span>
                    </div>
                    <p className="mt-3 text-sm text-ink-mute">
                        The block explorer for Alkebuleum — Africa's sovereign Layer 1. Chain ID {CHAIN_ID}.
                    </p>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {links.map(([label, href]) => (
                        <a key={href} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink-dim hover:text-accent">
                            {label}<ExternalIcon className="h-3 w-3 opacity-60" />
                        </a>
                    ))}
                </div>
            </div>
            <div className="border-t border-line">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-mute sm:px-6">
                    <span>© {new Date().getFullYear()} Alkebuleum</span>
                    <span>Built on chain. Owned by Africa.</span>
                </div>
            </div>
        </footer>
    );
}

export default function Shell({ children }) {
    const head = useChainHead();
    const { pathname } = useLocation();
    const isHome = pathname === "/";
    return (
        <div className="flex min-h-screen flex-col">
            <Header head={head} />
            <main className={`flex-1 ${isHome ? "" : "mx-auto w-full max-w-7xl px-4 py-8 sm:px-6"}`}>{children}</main>
            <Footer />
        </div>
    );
}
