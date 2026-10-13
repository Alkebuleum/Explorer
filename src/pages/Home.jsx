import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import SearchBar from "../components/ui/SearchBar";
import Card from "../components/ui/Card";
import ErrorBanner from "../components/ui/ErrorBanner";
import { Skeleton } from "../components/ui/Loading";
import { Stat, HashLink, Empty } from "../components/ui/Bits";
import { CubeIcon, TxIcon } from "../components/ui/Icons";
import { useLatestBlocks, useRecentTxs, useTick } from "../lib/hooks";
import { hexToInt, shortHash, timeAgo, formatNative, formatGasPrice } from "../lib/format";
import { CHAIN_ID, CHAIN_CURRENCY } from "../lib/rpc";

function Hero() {
    return (
        <section className="relative overflow-hidden border-b border-line">
            <div className="dot-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
            <div className="orbit-glow pointer-events-none absolute inset-0" />
            {/* Orbit rings, echoing the alkebuleum.org hero */}
            <div className="pointer-events-none absolute right-[-160px] top-1/2 hidden -translate-y-1/2 md:block">
                <div className="relative h-[520px] w-[520px]">
                    {[520, 380, 250].map((s) => (
                        <div key={s} className="absolute rounded-full border border-violet/20"
                            style={{ width: s, height: s, left: (520 - s) / 2, top: (520 - s) / 2 }} />
                    ))}
                    <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_80px_30px_rgba(139,109,255,0.55)]" />
                </div>
            </div>

            <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
                <span className="eyebrow">— Alkebuleum Mainnet · Chain {CHAIN_ID}</span>
                <h1 className="mt-4 max-w-2xl text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
                    Explore the <em className="font-light italic text-accent">ledger</em> of a continent.
                </h1>
                <p className="mt-4 max-w-xl text-ink-dim">
                    Blocks, transactions, tokens and verified smart contracts on Africa's sovereign Layer 1.
                </p>
                <div className="mt-8 max-w-2xl">
                    <SearchBar size="lg" />
                </div>
            </div>
        </section>
    );
}

function avgBlockTime(blocks) {
    if (blocks.length < 2) return null;
    const first = hexToInt(blocks[blocks.length - 1].timestamp);
    const last = hexToInt(blocks[0].timestamp);
    return (last - first) / (blocks.length - 1);
}

function BlocksList({ blocks, loading }) {
    useTick(1000);
    if (loading) return <ListSkeleton />;
    if (!blocks.length) return <Empty>No blocks yet.</Empty>;
    return (
        <ul>
            {blocks.map((b) => {
                const n = hexToInt(b.number);
                return (
                    <li key={b.hash} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                            <CubeIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <Link to={`/block/${n}`} className="link font-mono text-sm">{n.toLocaleString()}</Link>
                            <div className="text-xs text-ink-mute">{timeAgo(hexToInt(b.timestamp))}</div>
                        </div>
                        <div className="min-w-0 text-right text-xs">
                            <div className="text-ink-dim">
                                Validator <HashLink to={`/address/${b.miner}`}>{shortHash(b.miner, 4)}</HashLink>
                            </div>
                            <div className="text-ink-mute">{b.transactions.length} txn{b.transactions.length === 1 ? "" : "s"}</div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function TxList({ txs, loading, scannedBlocks }) {
    useTick(1000);
    if (loading) return <ListSkeleton />;
    if (!txs.length) return <Empty>No transactions in the last {scannedBlocks.toLocaleString()} blocks. The chain is quiet right now.</Empty>;
    return (
        <ul>
            {txs.map(({ tx, ts }) => (
                <li key={tx.hash} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
                        <TxIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <HashLink to={`/tx/${tx.hash}`}>{shortHash(tx.hash, 6)}</HashLink>
                        <div className="text-xs text-ink-mute">{timeAgo(ts)}</div>
                    </div>
                    <div className="min-w-0 text-right text-xs">
                        <div className="text-ink-dim">
                            From <HashLink to={`/address/${tx.from}`}>{shortHash(tx.from, 4)}</HashLink>
                        </div>
                        <div className="text-ink-dim">
                            {tx.to ? <>To <HashLink to={`/address/${tx.to}`}>{shortHash(tx.to, 4)}</HashLink></> : <span className="text-gold">Contract creation</span>}
                        </div>
                    </div>
                    <div className="hidden w-28 shrink-0 text-right font-mono text-xs text-ink sm:block">
                        {formatNative(tx.value, 4)} <span className="text-ink-mute">{CHAIN_CURRENCY}</span>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function ListSkeleton() {
    return (
        <div className="space-y-4 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 space-y-2"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
                    <Skeleton className="h-3 w-24" />
                </div>
            ))}
        </div>
    );
}

export default function Home() {
    const { blocks, gasPrice, error, loading } = useLatestBlocks(10);

    const recent = useRecentTxs({ want: 10 });

    // Live txs from polling first, then older ones found by the lookback scan.
    const txs = useMemo(() => {
        const live = blocks.flatMap((b) => b.transactions.map((tx) => ({ tx, ts: hexToInt(b.timestamp) })));
        const seen = new Set(live.map(({ tx }) => tx.hash));
        return [...live, ...recent.txs.filter(({ tx }) => !seen.has(tx.hash))].slice(0, 10);
    }, [blocks, recent.txs]);
    const latest = blocks[0];
    const bt = avgBlockTime(blocks);
    const txCount = blocks.reduce((n, b) => n + b.transactions.length, 0);

    return (
        <>
            <Hero />
            <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
                <ErrorBanner error={error} title="Couldn't reach the Alkebuleum RPC" />

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Latest block" value={latest ? `#${hexToInt(latest.number).toLocaleString()}` : "…"} sub={latest ? timeAgo(hexToInt(latest.timestamp)) : null} />
                    <Stat label="Avg block time" value={bt != null ? `${bt.toFixed(1)}s` : "…"} sub="last 10 blocks" />
                    <Stat label="Gas price" value={gasPrice ? formatGasPrice(gasPrice) : "…"} sub={`Txns in last 10 blocks: ${loading ? "…" : txCount}`} />
                    <Stat label="Chain ID" value={CHAIN_ID} sub={`Native coin: ${CHAIN_CURRENCY}`} />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card title="Latest blocks" flush>
                        <BlocksList blocks={blocks} loading={loading} />
                    </Card>
                    <Card
                        title="Latest transactions"
                        flush
                        actions={recent.scanning && <span className="text-xs text-ink-mute">Searching back… {recent.scannedBlocks.toLocaleString()} blocks</span>}
                    >
                        <TxList txs={txs} loading={loading || (recent.scanning && !txs.length)} scannedBlocks={recent.scannedBlocks} />
                    </Card>
                </div>
            </div>
        </>
    );
}
