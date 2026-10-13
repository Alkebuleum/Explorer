import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../components/ui/Card";
import Crumbs from "../components/ui/Crumbs";
import Badge from "../components/ui/Badge";
import ErrorBanner from "../components/ui/ErrorBanner";
import Loading from "../components/ui/Loading";
import { Row, HashLink, Mono, CopyButton } from "../components/ui/Bits";
import { rpc, CHAIN_CURRENCY } from "../lib/rpc";
import { hexToInt, hexToBig, shortHash, formatTs, timeAgo, formatNative, formatUnits, formatGasPrice } from "../lib/format";
import { isErc20Transfer, topicToAddress, probeErc20 } from "../lib/erc20";

export default function TxPage() {
    const { hash } = useParams();
    const [tx, setTx] = useState(null);
    const [rcpt, setRcpt] = useState(null);
    const [blockTs, setBlockTs] = useState(null);
    const [tokens, setTokens] = useState({}); // address -> erc20 meta | null
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [errDetails, setErrDetails] = useState(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                setErr(null); setErrDetails(null); setTokens({}); setBlockTs(null);
                const [t, r] = await Promise.all([
                    rpc("eth_getTransactionByHash", [hash]),
                    rpc("eth_getTransactionReceipt", [hash]),
                ]);
                if (!t) throw new Error("Transaction not found. It may still be propagating, or the hash is wrong.");
                if (!mounted) return;
                setTx(t);
                setRcpt(r);
                if (t.blockNumber) {
                    rpc("eth_getBlockByNumber", [t.blockNumber, false])
                        .then((b) => mounted && b && setBlockTs(hexToInt(b.timestamp)))
                        .catch(() => { });
                }
            } catch (e) {
                if (!mounted) return;
                setTx(null);
                setErr(e.message || "Failed to load transaction");
                setErrDetails(e.details || null);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [hash]);

    const transfers = useMemo(() => (rcpt?.logs || []).filter(isErc20Transfer), [rcpt]);

    // Look up symbol/decimals for each token that moved in this tx.
    useEffect(() => {
        const addrs = [...new Set(transfers.map((l) => l.address.toLowerCase()))];
        if (!addrs.length) return;
        let mounted = true;
        Promise.all(addrs.map((a) => probeErc20(a).catch(() => null))).then((metas) => {
            if (mounted) setTokens(Object.fromEntries(addrs.map((a, i) => [a, metas[i]])));
        });
        return () => { mounted = false; };
    }, [transfers]);

    const status = rcpt ? (hexToInt(rcpt.status) === 1 ? "Success" : "Failed") : tx ? "Pending" : null;
    const gasPrice = rcpt?.effectiveGasPrice || tx?.gasPrice;
    const fee = rcpt && gasPrice ? hexToBig(rcpt.gasUsed) * hexToBig(gasPrice) : null;
    const selector = tx?.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null;

    return (
        <div className="space-y-6">
            <div>
                <Crumbs items={[{ label: "Home", to: "/" }, { label: "Transaction" }]} />
                <h1 className="text-2xl font-medium sm:text-3xl">Transaction details</h1>
                <div className="mt-1 flex items-center gap-1 text-ink-dim">
                    <Mono className="break-all">{hash}</Mono><CopyButton value={hash} />
                </div>
            </div>

            <Card title="Overview">
                <ErrorBanner error={err} details={errDetails} />
                {!err && loading && <Loading />}
                {!err && !loading && tx && (
                    <div>
                        <Row label="Status">
                            <Badge tone={status === "Success" ? "success" : status === "Failed" ? "danger" : "warn"}>{status}</Badge>
                        </Row>
                        <Row label="Block">
                            {tx.blockNumber
                                ? <Link className="link font-mono text-[13px]" to={`/block/${hexToInt(tx.blockNumber)}`}>{hexToInt(tx.blockNumber).toLocaleString()}</Link>
                                : "Pending"}
                        </Row>
                        {blockTs && <Row label="Timestamp">{timeAgo(blockTs)} <span className="text-ink-mute">({formatTs("0x" + blockTs.toString(16))})</span></Row>}
                        <Row label="From"><HashLink to={`/address/${tx.from}`} copy={tx.from}>{tx.from}</HashLink></Row>
                        <Row label="To">
                            {tx.to ? (
                                <HashLink to={`/address/${tx.to}`} copy={tx.to}>{tx.to}</HashLink>
                            ) : rcpt?.contractAddress ? (
                                <span className="flex flex-wrap items-center gap-2">
                                    <Badge tone="warn">Contract created</Badge>
                                    <HashLink to={`/address/${rcpt.contractAddress}`} copy={rcpt.contractAddress}>{rcpt.contractAddress}</HashLink>
                                </span>
                            ) : <span className="text-gold">Contract creation</span>}
                        </Row>

                        {transfers.length > 0 && (
                            <Row label={`Token transfers (${transfers.length})`}>
                                <ul className="space-y-1.5">
                                    {transfers.map((l) => {
                                        const meta = tokens[l.address.toLowerCase()];
                                        const from = topicToAddress(l.topics[1]);
                                        const to = topicToAddress(l.topics[2]);
                                        return (
                                            <li key={l.logIndex} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="text-ink-mute">From</span><HashLink to={`/address/${from}`}>{shortHash(from, 4)}</HashLink>
                                                <span className="text-ink-mute">To</span><HashLink to={`/address/${to}`}>{shortHash(to, 4)}</HashLink>
                                                <span className="text-ink-mute">For</span>
                                                <span className="font-mono text-[13px]">{meta ? formatUnits(hexToBig(l.data), meta.decimals, 6) : hexToBig(l.data).toString()}</span>
                                                <Link to={`/address/${l.address}`} className="link">{meta?.symbol || shortHash(l.address, 4)}</Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </Row>
                        )}

                        <Row label="Value"><span className="font-mono text-[13px]">{formatNative(tx.value, 18)} {CHAIN_CURRENCY}</span></Row>
                        <Row label="Transaction fee">{fee != null ? <span className="font-mono text-[13px]">{formatNative(fee, 18)} {CHAIN_CURRENCY}</span> : "…"}</Row>
                        <Row label="Gas price">{gasPrice ? formatGasPrice(gasPrice) : "-"}</Row>
                        <Row label="Gas used / limit">
                            {rcpt ? hexToInt(rcpt.gasUsed).toLocaleString() : "…"} / {hexToInt(tx.gas).toLocaleString()}
                            {rcpt && <span className="text-ink-mute"> ({((hexToInt(rcpt.gasUsed) / hexToInt(tx.gas)) * 100).toFixed(1)}%)</span>}
                        </Row>
                        <Row label="Nonce">{hexToInt(tx.nonce)} <span className="text-ink-mute">· position {hexToInt(tx.transactionIndex)} in block</span></Row>
                        <Row label="Input data">
                            {tx.input === "0x" ? <span className="text-ink-mute">None (plain transfer)</span> : (
                                <details>
                                    <summary className="cursor-pointer select-none text-ink-dim">
                                        {selector && !tx.to ? "Contract creation bytecode" : <>Method <Mono className="text-accent">{selector}</Mono></>} · {((tx.input.length - 2) / 2).toLocaleString()} bytes
                                    </summary>
                                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs">{tx.input}</pre>
                                </details>
                            )}
                        </Row>
                        {rcpt && <Row label="Logs">{rcpt.logs.length} event{rcpt.logs.length === 1 ? "" : "s"} emitted</Row>}
                    </div>
                )}
            </Card>
        </div>
    );
}
