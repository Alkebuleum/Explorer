import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../components/ui/Card";
import Crumbs from "../components/ui/Crumbs";
import ErrorBanner from "../components/ui/ErrorBanner";
import Loading from "../components/ui/Loading";
import { Row, HashLink, Mono, CopyButton, Empty } from "../components/ui/Bits";
import { rpc, CHAIN_CURRENCY } from "../lib/rpc";
import { hexToInt, shortHash, formatTs, timeAgo, formatNative, toHexFromInput } from "../lib/format";

export default function BlockPage() {
    const { number } = useParams();
    const [block, setBlock] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [errDetails, setErrDetails] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setErr(null); setErrDetails(null);
                const b = await rpc("eth_getBlockByNumber", [toHexFromInput(number), true]);
                if (!b) throw new Error("Block not found. It may not have been produced yet.");
                if (!cancelled) setBlock(b);
            } catch (e) {
                if (!cancelled) {
                    setBlock(null);
                    setErr(e.message || String(e));
                    setErrDetails(e.details || null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [number]);

    const n = block ? hexToInt(block.number) : null;
    const gasUsed = block ? hexToInt(block.gasUsed) : 0;
    const gasLimit = block ? hexToInt(block.gasLimit) : 0;

    return (
        <div className="space-y-6">
            <div>
                <Crumbs items={[{ label: "Home", to: "/" }, { label: "Block" }]} />
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-medium sm:text-3xl">Block <span className="font-mono text-accent">#{n ?? number}</span></h1>
                    {n != null && (
                        <div className="flex gap-1">
                            <Link to={`/block/${n - 1}`} className={`btn-ghost btn-sm ${n === 0 ? "pointer-events-none opacity-40" : ""}`}>← Prev</Link>
                            <Link to={`/block/${n + 1}`} className="btn-ghost btn-sm">Next →</Link>
                        </div>
                    )}
                </div>
            </div>

            <Card title="Overview">
                <ErrorBanner error={err} details={errDetails} />
                {!err && loading && <Loading />}
                {!err && !loading && block && (
                    <div>
                        <Row label="Block height"><Mono>{n.toLocaleString()}</Mono></Row>
                        <Row label="Timestamp">{timeAgo(hexToInt(block.timestamp))} <span className="text-ink-mute">({formatTs(block.timestamp)})</span></Row>
                        <Row label="Transactions">{block.transactions.length} transaction{block.transactions.length === 1 ? "" : "s"}</Row>
                        <Row label="Validator"><HashLink to={`/address/${block.miner}`} copy={block.miner}>{block.miner}</HashLink></Row>
                        <Row label="Gas used">
                            {gasUsed.toLocaleString()} <span className="text-ink-mute">({gasLimit ? ((gasUsed / gasLimit) * 100).toFixed(2) : 0}% of {gasLimit.toLocaleString()})</span>
                        </Row>
                        {block.baseFeePerGas && <Row label="Base fee">{hexToInt(block.baseFeePerGas).toLocaleString()} wei</Row>}
                        <Row label="Size">{hexToInt(block.size).toLocaleString()} bytes</Row>
                        <Row label="Hash"><span className="inline-flex items-center gap-1"><Mono>{block.hash}</Mono><CopyButton value={block.hash} /></span></Row>
                        <Row label="Parent hash">
                            {n > 0 ? <HashLink to={`/block/${n - 1}`}>{block.parentHash}</HashLink> : <Mono>{block.parentHash}</Mono>}
                        </Row>
                    </div>
                )}
            </Card>

            {!err && block && (
                <Card title={`Transactions (${block.transactions.length})`} flush>
                    {block.transactions.length === 0 ? (
                        <Empty>This block has no transactions.</Empty>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="table-base">
                                <thead>
                                    <tr><th>Tx hash</th><th>From</th><th>To</th><th className="text-right">Value</th><th className="text-right">Gas limit</th></tr>
                                </thead>
                                <tbody>
                                    {block.transactions.map((tx) => (
                                        <tr key={tx.hash}>
                                            <td><HashLink to={`/tx/${tx.hash}`}>{shortHash(tx.hash)}</HashLink></td>
                                            <td><HashLink to={`/address/${tx.from}`}>{shortHash(tx.from)}</HashLink></td>
                                            <td>
                                                {tx.to
                                                    ? <HashLink to={`/address/${tx.to}`}>{shortHash(tx.to)}</HashLink>
                                                    : <span className="text-gold">Contract creation</span>}
                                            </td>
                                            <td className="text-right font-mono text-[13px]">{formatNative(tx.value)} {CHAIN_CURRENCY}</td>
                                            <td className="text-right font-mono text-[13px] text-ink-dim">{hexToInt(tx.gas).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}
