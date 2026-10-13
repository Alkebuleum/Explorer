import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../components/ui/Card";
import Crumbs from "../components/ui/Crumbs";
import Badge from "../components/ui/Badge";
import ErrorBanner from "../components/ui/ErrorBanner";
import Loading, { Skeleton } from "../components/ui/Loading";
import { HashLink, CopyButton, Tabs, Stat, Empty } from "../components/ui/Bits";
import { ShieldCheckIcon, ExternalIcon } from "../components/ui/Icons";
import { rpc, CHAIN_CURRENCY } from "../lib/rpc";
import { hexToInt, hexToBig, intToHex, shortHash, formatUnits, formatNative, ZERO_ADDRESS } from "../lib/format";
import { TRANSFER_TOPIC, topicToAddress, probeErc20 } from "../lib/erc20";
import { getVerified } from "../lib/verifiedStore";
import { getRegistryToken, registryTone } from "../lib/tokenRegistry";
import TokenLogo from "../components/ui/TokenLogo";

const ContractTab = lazy(() => import("../components/contract/ContractTab"));

const LOG_SCAN_RANGE = 5000; // blocks of history to scan for recent transfers
const MAX_TRANSFERS_SHOWN = 25;
const HOLDER_SCAN_CHUNK = 5000; // matches the confirmed eth_getLogs range limit on this RPC

// Session-only cache so navigating away and back doesn't force a rescan.
const holdersCache = new Map();

function countHolders(balances) {
    let n = 0;
    for (const [addr, bal] of balances) if (addr !== ZERO_ADDRESS && bal > 0n) n++;
    return n;
}

function finalizeHolders(balances) {
    return [...balances.entries()]
        .filter(([addr, bal]) => addr !== ZERO_ADDRESS && bal > 0n)
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .map(([address, balance]) => ({ address, balance }));
}

function TransfersTab({ address, token }) {
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                setErr(null);
                const latest = hexToInt(await rpc("eth_blockNumber"));
                const logs = await rpc("eth_getLogs", [{
                    address,
                    topics: [TRANSFER_TOPIC],
                    fromBlock: intToHex(Math.max(0, latest - LOG_SCAN_RANGE)),
                    toBlock: intToHex(latest),
                }]);
                if (!mounted) return;
                const sorted = [...(logs || [])].sort((a, b) => {
                    const bn = hexToInt(b.blockNumber) - hexToInt(a.blockNumber);
                    return bn !== 0 ? bn : hexToInt(b.logIndex) - hexToInt(a.logIndex);
                });
                setTransfers(sorted.slice(0, MAX_TRANSFERS_SHOWN));
            } catch (e) {
                if (mounted) { setTransfers([]); setErr(e.message || "Failed to load transfers"); }
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [address]);

    if (err) return <div className="p-5"><ErrorBanner error={err} /></div>;
    if (loading) return <div className="p-5"><Loading /></div>;
    if (!transfers.length) return <Empty>No transfers in the last {LOG_SCAN_RANGE.toLocaleString()} blocks.</Empty>;
    return (
        <div className="overflow-x-auto">
            <table className="table-base">
                <thead><tr><th>Tx hash</th><th>Block</th><th>From</th><th>To</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                    {transfers.map((log) => {
                        const from = topicToAddress(log.topics[1]);
                        const to = topicToAddress(log.topics[2]);
                        return (
                            <tr key={`${log.transactionHash}-${log.logIndex}`}>
                                <td><HashLink to={`/tx/${log.transactionHash}`}>{shortHash(log.transactionHash)}</HashLink></td>
                                <td><Link className="link font-mono text-[13px]" to={`/block/${hexToInt(log.blockNumber)}`}>{hexToInt(log.blockNumber)}</Link></td>
                                <td>{from === ZERO_ADDRESS ? <Badge tone="violet">Mint</Badge> : <HashLink to={`/address/${from}`}>{shortHash(from)}</HashLink>}</td>
                                <td>{to === ZERO_ADDRESS ? <Badge tone="danger">Burn</Badge> : <HashLink to={`/address/${to}`}>{shortHash(to)}</HashLink>}</td>
                                <td className="text-right font-mono text-[13px]">{formatUnits(hexToBig(log.data), token.decimals, 6)} {token.symbol}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-mute">Showing the latest {MAX_TRANSFERS_SHOWN} transfers from the last {LOG_SCAN_RANGE.toLocaleString()} blocks.</p>
        </div>
    );
}

function HoldersTab({ address, token }) {
    const [scan, setScan] = useState(() => holdersCache.get(address) || { status: "idle" });
    const cancelRef = useRef(false);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; cancelRef.current = true; };
    }, []);

    async function run() {
        cancelRef.current = false;
        setScan({ status: "scanning", blocksScanned: 0, totalBlocks: 1, requestCount: 0, holderCountSoFar: 0 });
        const balances = new Map();
        let requestCount = 0;
        let partial = false;
        let errorMsg = null;
        try {
            const latest = hexToInt(await rpc("eth_blockNumber"));
            let cursor = 0;
            while (cursor <= latest) {
                if (cancelRef.current) { partial = true; break; }
                const end = Math.min(cursor + HOLDER_SCAN_CHUNK - 1, latest);
                let logs;
                try {
                    logs = await rpc("eth_getLogs", [{ address, topics: [TRANSFER_TOPIC], fromBlock: intToHex(cursor), toBlock: intToHex(end) }]);
                } catch (e) {
                    partial = true;
                    errorMsg = e.message || "Scan failed partway through";
                    break;
                }
                requestCount++;
                for (const log of logs || []) {
                    const from = topicToAddress(log.topics[1]);
                    const to = topicToAddress(log.topics[2]);
                    const value = hexToBig(log.data);
                    balances.set(from, (balances.get(from) || 0n) - value);
                    balances.set(to, (balances.get(to) || 0n) + value);
                }
                if (mountedRef.current) {
                    setScan({ status: "scanning", blocksScanned: end + 1, totalBlocks: latest + 1, requestCount, holderCountSoFar: countHolders(balances) });
                }
                cursor = end + 1;
            }
        } catch (e) {
            partial = true;
            errorMsg = e.message || "Scan failed";
        }
        const holders = finalizeHolders(balances);
        const result = { status: partial ? (errorMsg ? "error" : "cancelled") : "done", holders, holderCount: holders.length, error: errorMsg };
        if (!partial) holdersCache.set(address, result);
        if (mountedRef.current) setScan(result);
    }

    if (scan.status === "idle") {
        return (
            <div className="space-y-3 p-5">
                <p className="max-w-2xl text-sm text-ink-dim">
                    Holder balances aren't indexed yet. A scan replays the token's full transfer history from the chain,
                    which can take hundreds of requests for an older token.
                </p>
                <button onClick={run} className="btn-violet">Scan holders</button>
            </div>
        );
    }

    if (scan.status === "scanning") {
        const pct = Math.min(100, (scan.blocksScanned / scan.totalBlocks) * 100);
        return (
            <div className="space-y-3 p-5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-gradient-to-r from-violet to-violet-deep transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-sm text-ink-mute">
                    {pct.toFixed(1)}% · {scan.blocksScanned.toLocaleString()} / {scan.totalBlocks.toLocaleString()} blocks · {scan.requestCount} requests · {scan.holderCountSoFar} holders so far
                </p>
                <button onClick={() => { cancelRef.current = true; }} className="btn-ghost btn-sm">Cancel</button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="text-sm">
                    <span className="font-medium">{scan.holderCount.toLocaleString()}</span> holder{scan.holderCount === 1 ? "" : "s"}
                    {scan.status !== "done" && <span className="text-gold"> (partial{scan.status === "cancelled" ? ", cancelled" : ""})</span>}
                </div>
                <button onClick={run} className="btn-ghost btn-sm">Rescan</button>
            </div>
            {scan.status === "error" && <div className="px-5"><ErrorBanner error={scan.error} /></div>}
            {scan.holders.length > 0 && (
                <div className="overflow-x-auto border-t border-line">
                    <table className="table-base">
                        <thead><tr><th>Rank</th><th>Address</th><th className="text-right">Balance</th><th className="text-right">Share</th></tr></thead>
                        <tbody>
                            {scan.holders.slice(0, 100).map((h, i) => {
                                const pct = token.totalSupply > 0n ? Number((h.balance * 10000n) / token.totalSupply) / 100 : 0;
                                return (
                                    <tr key={h.address}>
                                        <td className="text-ink-mute">{i + 1}</td>
                                        <td><HashLink to={`/address/${h.address}`}>{h.address}</HashLink></td>
                                        <td className="text-right font-mono text-[13px]">{formatUnits(h.balance, token.decimals, 4)} {token.symbol}</td>
                                        <td className="text-right">
                                            <div className="ml-auto flex w-32 items-center gap-2">
                                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-violet" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                                                <span className="w-14 text-right font-mono text-xs">{pct.toFixed(2)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {scan.holders.length > 100 && <p className="border-t border-line px-5 py-3 text-xs text-ink-mute">Showing top 100 of {scan.holders.length.toLocaleString()} holders.</p>}
                </div>
            )}
        </div>
    );
}

export default function AddressPage() {
    const { address } = useParams();
    const [info, setInfo] = useState(null); // { balance, code, nonce }
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [errDetails, setErrDetails] = useState(null);
    const [token, setToken] = useState(null);
    const [verified, setVerified] = useState(null);
    const [listing, setListing] = useState(null); // token registry entry
    const [tab, setTab] = useState(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                setErr(null); setErrDetails(null);
                setInfo(null); setToken(null); setVerified(null); setListing(null); setTab(null);
                if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
                    throw new Error("That isn't a valid address. Addresses are 0x followed by 40 hex characters.");
                }
                const [bal, code, nonce] = await Promise.all([
                    rpc("eth_getBalance", [address, "latest"]),
                    rpc("eth_getCode", [address, "latest"]),
                    rpc("eth_getTransactionCount", [address, "latest"]),
                ]);
                if (!mounted) return;
                setInfo({ balance: hexToBig(bal), code, nonce: hexToInt(nonce) });
                if (code && code !== "0x") {
                    setTab("contract");
                    const [tok, ver, reg] = await Promise.all([
                        probeErc20(address).catch(() => null),
                        getVerified(address).catch(() => null),
                        getRegistryToken(address).catch(() => null),
                    ]);
                    if (!mounted) return;
                    setToken(tok);
                    setVerified(ver);
                    setListing(reg);
                }
            } catch (e) {
                if (!mounted) return;
                setErr(e.message || "Failed to load address");
                setErrDetails(e.details || null);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [address]);

    const onVerifiedChange = useCallback((r) => setVerified(r), []);

    const isContract = info?.code && info.code !== "0x";
    const title = listing?.name || token?.name || verified?.contractName || (isContract ? "Contract" : "Address");

    const tabs = isContract ? [
        {
            id: "contract",
            label: "Contract",
            badge: verified ? <ShieldCheckIcon className="h-4 w-4 text-emerald-500" /> : <span className="h-1.5 w-1.5 rounded-full bg-gold" />,
        },
        token && { id: "transfers", label: "Token transfers" },
        token && { id: "holders", label: "Holders" },
    ].filter(Boolean) : [];

    return (
        <div className="space-y-6">
            <div>
                <Crumbs items={[{ label: "Home", to: "/" }, { label: isContract ? "Contract" : "Address" }]} />
                <div className="flex flex-wrap items-center gap-3">
                    {listing && <TokenLogo token={listing} size="h-9 w-9" />}
                    <h1 className="text-2xl font-medium sm:text-3xl">
                        {loading ? <Skeleton className="h-8 w-48" /> : <>{title}{token?.symbol && <span className="text-ink-mute"> ({token.symbol})</span>}</>}
                    </h1>
                    {!loading && info && (
                        <div className="flex flex-wrap gap-2">
                            <Badge>{isContract ? "Contract" : "Wallet"}</Badge>
                            {token && <Badge tone="violet">ERC-20 token</Badge>}
                            {listing && <Badge tone={registryTone(listing.status)}>Registry: {listing.status}</Badge>}
                            {verified && <Badge tone="success" icon={<ShieldCheckIcon className="h-3.5 w-3.5" />}>Verified</Badge>}
                        </div>
                    )}
                </div>
                <div className="mt-1 flex items-center gap-1 text-ink-dim">
                    <span className="break-all font-mono text-[13px]">{address}</span><CopyButton value={address} />
                </div>
            </div>

            <ErrorBanner error={err} details={errDetails} />

            {listing?.status.toLowerCase() === "flagged" && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200">
                    <span className="font-medium">This token has been flagged in the Alkebuleum token registry.</span> Be careful interacting with it.
                </div>
            )}

            {token && !listing && !loading && (
                <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-sm sm:flex-row sm:items-center">
                    <p className="flex-1 text-ink-dim">
                        This token isn't in the Alkebuleum token registry yet. Owners can list it to add a logo, description and website, and to appear in JollofSwap and Nuru.
                    </p>
                    <Link to={`/tokens/register?token=${address}`} className="btn-ghost btn-sm shrink-0">Register token</Link>
                </div>
            )}

            {listing && (listing.description || listing.website) && (
                <Card>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="max-w-3xl">
                            <div className="text-xs uppercase tracking-wider text-ink-mute">Token profile</div>
                            {listing.description && <p className="mt-1.5 text-sm text-ink-dim">{listing.description}</p>}
                            {listing.createdAtMs > 0 && (
                                <p className="mt-2 text-xs text-ink-mute">Registered {new Date(listing.createdAtMs).toLocaleDateString()} in the Alkebuleum token registry</p>
                            )}
                        </div>
                        {listing.website && (
                            <a href={listing.website} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-sm shrink-0">
                                {listing.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}<ExternalIcon className="h-3 w-3" />
                            </a>
                        )}
                    </div>
                </Card>
            )}

            {info && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Stat label={`${CHAIN_CURRENCY} balance`} value={<span className="font-mono">{formatNative(info.balance, 6)}</span>} sub={CHAIN_CURRENCY} />
                    {token ? (
                        <Stat label="Total supply" value={<span className="font-mono">{formatUnits(token.totalSupply, token.decimals, 2)}</span>} sub={`${token.symbol} · ${token.decimals} decimals`} />
                    ) : (
                        <Stat label={isContract ? "Contract nonce" : "Transactions sent"} value={info.nonce.toLocaleString()} sub="account nonce" />
                    )}
                    <Stat
                        label="Source code"
                        value={!isContract ? "—" : verified ? "Verified" : "Not verified"}
                        sub={!isContract ? "Wallets have no code" : verified ? `${verified.contractName} · v${verified.compilerVersion}` : "Deployer can verify below"}
                    />
                </div>
            )}

            {isContract && (
                <Card flush>
                    <Tabs tabs={tabs} active={tab} onChange={setTab} />
                    {tab === "contract" && (
                        <Suspense fallback={<div className="p-5"><Loading label="Loading contract tools…" /></div>}>
                            <ContractTab address={address} code={info.code} onVerifiedChange={onVerifiedChange} />
                        </Suspense>
                    )}
                    {tab === "transfers" && token && <TransfersTab address={address} token={token} />}
                    {tab === "holders" && token && <HoldersTab address={address} token={token} />}
                </Card>
            )}

            {info && !isContract && (
                <Card>
                    <p className="text-sm text-ink-dim">
                        This is a wallet (externally owned account). It has sent <span className="font-medium text-ink">{info.nonce.toLocaleString()}</span> transaction{info.nonce === 1 ? "" : "s"}.
                        Full transaction history needs an indexer, which AlkeScan doesn't run yet. Search for a transaction hash to see its details.
                    </p>
                </Card>
            )}
        </div>
    );
}
