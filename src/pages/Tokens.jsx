import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Loading from "../components/ui/Loading";
import TokenLogo from "../components/ui/TokenLogo";
import { Empty, CopyButton } from "../components/ui/Bits";
import { SearchIcon } from "../components/ui/Icons";
import { fetchRegistry, registryTone } from "../lib/tokenRegistry";
import { shortHash } from "../lib/format";

export default function TokensPage() {
    const [tokens, setTokens] = useState(null);
    const [q, setQ] = useState("");

    useEffect(() => {
        fetchRegistry().then((m) =>
            setTokens([...m.values()].sort((a, b) => (a.isNative ? -1 : b.isNative ? 1 : a.symbol.localeCompare(b.symbol))))
        );
    }, []);

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!tokens || !s) return tokens;
        return tokens.filter((t) => `${t.symbol} ${t.name} ${t.address}`.toLowerCase().includes(s));
    }, [tokens, q]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="eyebrow">Token registry</div>
                    <h1 className="mt-2 text-2xl font-medium sm:text-3xl">Alkebuleum tokens</h1>
                    <p className="mt-1 max-w-xl text-sm text-ink-dim">
                        Tokens registered in the Alkebuleum ecosystem registry, shared with JollofSwap and Nuru.
                    </p>
                </div>
                <Link to="/tokens/register" className="btn-violet shrink-0">Register a token</Link>
            </div>

            <Card
                flush
                title={tokens ? `${tokens.length} token${tokens.length === 1 ? "" : "s"}` : "Tokens"}
                actions={
                    <label className="flex items-center gap-2 rounded-full border border-line-2 px-3 py-1 focus-within:border-violet">
                        <SearchIcon className="h-3.5 w-3.5 text-ink-mute" />
                        <input className="w-40 bg-transparent text-sm outline-none placeholder:text-ink-mute" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
                    </label>
                }
            >
                {!shown ? <div className="p-5"><Loading /></div> : !shown.length ? <Empty>No tokens match.</Empty> : (
                    <div className="overflow-x-auto">
                        <table className="table-base">
                            <thead><tr><th>Token</th><th>Contract</th><th>Status</th><th className="hidden md:table-cell">About</th></tr></thead>
                            <tbody>
                                {shown.map((t) => (
                                    <tr key={t.addressLower}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <TokenLogo token={t} />
                                                <div>
                                                    {t.isNative ? <span className="font-medium">{t.name}</span> : <Link to={`/address/${t.address}`} className="font-medium hover:text-accent">{t.name}</Link>}
                                                    <div className="text-xs text-ink-mute">{t.symbol}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {t.isNative ? <span className="text-ink-mute">Native coin</span> : (
                                                <span className="inline-flex items-center gap-1">
                                                    <Link to={`/address/${t.address}`} className="link font-mono text-[13px]">{shortHash(t.address)}</Link>
                                                    <CopyButton value={t.address} />
                                                </span>
                                            )}
                                        </td>
                                        <td><Badge tone={registryTone(t.status)}>{t.status}</Badge></td>
                                        <td className="hidden max-w-md truncate text-ink-dim md:table-cell" title={t.description}>{t.description || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
