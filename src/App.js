/* eslint-env browser, es2020 */

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation, Link } from "react-router-dom";

import Topbar from './components/ui/Topbar';
import Card from './components/ui/Card';
import SearchBar from './components/ui/SearchBar';
import ErrorBanner from './components/ui/ErrorBanner';
import Loading from './components/ui/Loading';
import Badge from './components/ui/Badge';
import Crumbs from './components/ui/Crumbs';

const ContractVerify = lazy(() => import('./components/ContractVerify'));

/* -------------------------------------------------------
   Config
------------------------------------------------------- */
export const RPC_URL = "https://rpc.alkebuleum.com";
const CHAIN_CURRENCY = "ALKE";

/* -------------------------------------------------------
   RPC util (timeout + structured errors)
------------------------------------------------------- */
let _reqId = 1;
export async function rpc(method, params = [], { timeoutMs = 10000 } = {}) {
  const id = _reqId++;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw makeRpcError({
        type: "HTTP",
        status: res.status,
        statusText: res.statusText,
        body: text,
        method,
        params,
      });
    }

    let data;
    try {
      data = await res.json();
    } catch (_e) {
      const text = await res.text().catch(() => "");
      throw makeRpcError({ type: "BAD_JSON", body: text, method, params });
    }

    if (data?.error) {
      throw makeRpcError({
        type: "RPC",
        code: data.error.code,
        message: data.error.message,
        data: data.error.data,
        method,
        params,
      });
    }

    return data.result;
  } catch (err) {
    if (err.name === "AbortError") {
      throw makeRpcError({ type: "TIMEOUT", method, params });
    }
    if (!err.__isRpcError) {
      throw makeRpcError({ type: "NETWORK", raw: String(err), method, params });
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function makeRpcError(info) {
  const e = new Error(humanRpcError(info));
  e.__isRpcError = true;
  e.details = info;
  return e;
}

function humanRpcError(info) {
  switch (info.type) {
    case "HTTP": return `HTTP ${info.status} ${info.statusText} from RPC.`;
    case "BAD_JSON": return `RPC returned invalid JSON.`;
    case "RPC": return `RPC Error (${info.code ?? "unknown"}): ${info.message ?? "Unknown error"}.`;
    case "TIMEOUT": return `RPC timeout after 10s.`;
    case "NETWORK": return `Network error reaching RPC: ${info.raw}`;
    default: return "Unknown RPC error.";
  }
}

/* -------------------------------------------------------
   Utils
------------------------------------------------------- */
const hexToInt = (h) => (h ? parseInt(h, 16) : 0);
const intToHex = (n) => "0x" + BigInt(n).toString(16);
const shortHash = (h, l = 6) => (h ? `${h.slice(0, 2 + l)}…${h.slice(-l)}` : "-");
const formatTs = (hexTs) => new Date(hexToInt(hexTs) * 1000).toLocaleString();
const fromWei = (hex) => hexToInt(hex) / 1e18;

/* -------------------------------------------------------
   ERC-20 helpers
------------------------------------------------------- */
const ERC20_SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
};
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const LOG_SCAN_RANGE = 5000; // blocks of history to scan for recent transfers
const MAX_TRANSFERS_SHOWN = 25;

function hexToAscii(hex) {
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (code) str += String.fromCharCode(code);
  }
  return str.trim();
}

// Decodes an ABI-encoded `string` return value, tolerating the legacy
// bytes32-return style some older ERC-20s (e.g. pre-standard tokens) use.
function decodeAbiString(hex) {
  if (!hex || hex === "0x") return "";
  const clean = hex.slice(2);
  if (clean.length <= 64) return hexToAscii(clean.replace(/0+$/, clean.length % 2 ? "0" : ""));
  const length = parseInt(clean.slice(64, 128), 16);
  const dataHex = clean.slice(128, 128 + length * 2);
  return hexToAscii(dataHex);
}

const decodeUint = (hex) => (hex && hex !== "0x" ? BigInt(hex) : 0n);

function addCommas(numStr) {
  const [whole, frac] = numStr.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${withCommas}.${frac}` : withCommas;
}

function formatUnits(value, decimals) {
  const neg = value < 0n;
  if (neg) value = -value;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const s = addCommas(whole.toString()) + (fracStr ? "." + fracStr : "");
  return neg ? "-" + s : s;
}

const topicToAddress = (topic) => "0x" + topic.slice(-40);
const ZERO_ADDRESS = "0x" + "0".repeat(40);
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

// decimal (with/without commas), hex, number, BigInt
function toHexFromInput(v) {
  const toBig = (n) => (typeof BigInt !== "undefined" ? BigInt(n) : Number(n));
  if (typeof v === "number") return "0x" + v.toString(16);
  if (typeof v === "bigint") return "0x" + v.toString(16);
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (/^0x[0-9a-fA-F]+$/.test(s)) return s.toLowerCase();
    if (/^[0-9]+$/.test(s)) return "0x" + toBig(s).toString(16);
  }
  throw new Error(`Invalid block identifier: ${v}`);
}



function Shell({ children, latest, timeAgo }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-black dark:text-slate-100">
      <Topbar />
      <div className="border-b border-slate-200/80 bg-white/50 backdrop-blur dark:bg-black/30 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-2 text-sm text-slate-600 dark:text-slate-300">
          Latest block:{" "}
          <Link className="underline" to={`/block/${latest ?? ""}`}>{latest ?? "…"}</Link>
          <span className="mx-1">·</span>
          {timeAgo || "—"}
        </div>
      </div>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 py-4 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
        © {new Date().getFullYear()} Alkebuleum
      </footer>
    </div>
  );
}





/* -------------------------------------------------------
   Global hook: chain head
------------------------------------------------------- */
function useChainHead() {
  const [head, setHead] = useState({ number: null, ts: null, ago: "" });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const nHex = await rpc("eth_blockNumber");
        const n = hexToInt(nHex);
        const blk = await rpc("eth_getBlockByNumber", [intToHex(n), false]);
        const ts = hexToInt(blk?.timestamp);
        const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
        const ago = diff < 60 ? `${diff}s ago` : `${Math.floor(diff / 60)}m ago`;
        if (mounted) setHead({ number: n, ts, ago });
      } catch {
        // ignore banner hiccups
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return head;
}

/* -------------------------------------------------------
   Pages
------------------------------------------------------- */
function Home() {
  return (
    <div className="space-y-6">
      <Card title="Search">
        <SearchBar />
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
          Tip: Search by transaction hash, address, or block number. Example <code className="bg-slate-100 px-1 rounded dark:bg-white/10">0xabc123…</code> or <code className="bg-slate-100 px-1 rounded dark:bg-white/10">12345</code>
        </p>
      </Card>
      <Card title="Quick Links">
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="underline" to="/block/0">Genesis</Link>
        </div>
      </Card>
    </div>
  );
}

function AddressPage() {
  const { address } = useParams();
  const [balance, setBalance] = useState(null);
  const [code, setCode] = useState(null);
  const [nonce, setNonce] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [errDetails, setErrDetails] = useState(null);

  const [token, setToken] = useState(null); // { name, symbol, decimals, totalSupply } | null
  const [tokenLoading, setTokenLoading] = useState(false);

  const [transfers, setTransfers] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transfersErr, setTransfersErr] = useState(null);

  const [holderScan, setHolderScan] = useState({ status: "idle" });
  const holderCancelRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null); setErrDetails(null);
        setToken(null); setTransfers([]); setTransfersErr(null);
        holderCancelRef.current = false;
        setHolderScan(holdersCache.get(address) || { status: "idle" });
        const [bal, cd, nn] = await Promise.all([
          rpc("eth_getBalance", [address, "latest"]),
          rpc("eth_getCode", [address, "latest"]),
          rpc("eth_getTransactionCount", [address, "latest"]),
        ]);
        if (!mounted) return;
        setBalance(fromWei(bal));
        setCode(cd);
        setNonce(hexToInt(nn));
      } catch (e) {
        if (!mounted) return;
        setErr(e.message || "Failed to load address");
        setErrDetails(e.details || null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; holderCancelRef.current = true; };
  }, [address]);

  // Once we know this is a contract, probe it for ERC-20 metadata.
  useEffect(() => {
    if (!code || code === "0x") return;
    let mounted = true;
    (async () => {
      try {
        setTokenLoading(true);
        const call = (data) => rpc("eth_call", [{ to: address, data }, "latest"]);
        const [nameRes, symbolRes, decimalsRes, supplyRes] = await Promise.allSettled([
          call(ERC20_SELECTORS.name),
          call(ERC20_SELECTORS.symbol),
          call(ERC20_SELECTORS.decimals),
          call(ERC20_SELECTORS.totalSupply),
        ]);
        if (!mounted) return;

        const ok = (r) => r.status === "fulfilled" && r.value && r.value !== "0x";
        // A real ERC-20 must at least expose symbol, decimals, and totalSupply.
        if (!ok(symbolRes) || !ok(decimalsRes) || !ok(supplyRes)) {
          setToken(null);
          return;
        }
        const decimals = Number(decodeUint(decimalsRes.value));
        setToken({
          name: ok(nameRes) ? decodeAbiString(nameRes.value) : "",
          symbol: decodeAbiString(symbolRes.value),
          decimals,
          totalSupply: decodeUint(supplyRes.value),
        });
      } catch {
        if (mounted) setToken(null);
      } finally {
        if (mounted) setTokenLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [address, code]);

  // Once confirmed a token, pull recent Transfer logs.
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    (async () => {
      try {
        setTransfersLoading(true);
        setTransfersErr(null);
        const latest = hexToInt(await rpc("eth_blockNumber"));
        const fromBlock = Math.max(0, latest - LOG_SCAN_RANGE);
        const logs = await rpc("eth_getLogs", [{
          address,
          topics: [TRANSFER_TOPIC],
          fromBlock: intToHex(fromBlock),
          toBlock: intToHex(latest),
        }]);
        if (!mounted) return;
        const sorted = [...(logs || [])].sort((a, b) => {
          const bn = hexToInt(b.blockNumber) - hexToInt(a.blockNumber);
          return bn !== 0 ? bn : hexToInt(b.logIndex) - hexToInt(a.logIndex);
        });
        setTransfers(sorted.slice(0, MAX_TRANSFERS_SHOWN));
      } catch (e) {
        if (!mounted) return;
        setTransfers([]);
        setTransfersErr(e.message || "Failed to load transfers");
      } finally {
        if (mounted) setTransfersLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [address, token]);

  async function runHolderScan() {
    holderCancelRef.current = false;
    setHolderScan({ status: "scanning", blocksScanned: 0, totalBlocks: 1, requestCount: 0, holderCountSoFar: 0 });

    const balances = new Map();
    let requestCount = 0;
    let partial = false;
    let errorMsg = null;
    let latest = 0;

    try {
      latest = hexToInt(await rpc("eth_blockNumber"));
      const totalBlocks = latest + 1;
      let cursor = 0;
      while (cursor <= latest) {
        if (holderCancelRef.current) { partial = true; break; }
        const end = Math.min(cursor + HOLDER_SCAN_CHUNK - 1, latest);
        let logs;
        try {
          logs = await rpc("eth_getLogs", [{
            address,
            topics: [TRANSFER_TOPIC],
            fromBlock: intToHex(cursor),
            toBlock: intToHex(end),
          }]);
        } catch (e) {
          partial = true;
          errorMsg = e.message || "Scan failed partway through";
          break;
        }
        requestCount++;
        for (const log of logs || []) {
          const from = topicToAddress(log.topics[1]);
          const to = topicToAddress(log.topics[2]);
          const value = decodeUint(log.data);
          balances.set(from, (balances.get(from) || 0n) - value);
          balances.set(to, (balances.get(to) || 0n) + value);
        }
        if (mountedRef.current) {
          setHolderScan({
            status: "scanning",
            blocksScanned: end + 1,
            totalBlocks,
            requestCount,
            holderCountSoFar: countHolders(balances),
          });
        }
        cursor = end + 1;
      }
    } catch (e) {
      partial = true;
      errorMsg = e.message || "Scan failed";
    }

    const holders = finalizeHolders(balances);
    const result = {
      status: partial ? (errorMsg ? "error" : "cancelled") : "done",
      holders,
      holderCount: holders.length,
      requestCount,
      latest,
      error: errorMsg,
    };
    if (!partial) holdersCache.set(address, result);
    if (mountedRef.current) setHolderScan(result);
  }

  const isContract = code && code !== "0x";

  return (
    <div className="space-y-6">
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Address" }, { label: shortHash(address, 8) }]} />
      <Card title="Address">
        <ErrorBanner error={err} details={errDetails} />
        {!err && loading && <Loading />}
        {!err && !loading && (
          <div className="grid gap-2">
            <Row label="Address"><code className="font-mono">{address}</code></Row>
            <Row label="Type">
              <div className="flex flex-wrap gap-2">
                {isContract ? <Badge>Contract</Badge> : <Badge>Externally Owned Account</Badge>}
                {token && <Badge tone="success">Token (ERC-20)</Badge>}
              </div>
            </Row>
            <Row label="Balance">{`${balance} ${CHAIN_CURRENCY}`}</Row>
            <Row label="Nonce">{nonce}</Row>
          </div>
        )}
      </Card>

      {isContract && !loading && (
        <Card title="Contract Source Code">
          <Suspense fallback={<Loading label="Loading verifier…" />}>
            <ContractVerify address={address} />
          </Suspense>
        </Card>
      )}

      {isContract && (tokenLoading || token) && (
        <Card title="Token Info">
          {tokenLoading && <Loading />}
          {!tokenLoading && token && (
            <div className="grid gap-2">
              <Row label="Name">{token.name || "-"}</Row>
              <Row label="Symbol">{token.symbol || "-"}</Row>
              <Row label="Decimals">{token.decimals}</Row>
              <Row label="Total Supply">
                {formatUnits(token.totalSupply, token.decimals)} {token.symbol}
              </Row>
              <Row label="Contract Address"><code className="font-mono">{address}</code></Row>
            </div>
          )}
        </Card>
      )}

      {token && (
        <Card title="Recent Transfers">
          <ErrorBanner error={transfersErr} />
          {!transfersErr && transfersLoading && <Loading />}
          {!transfersErr && !transfersLoading && transfers.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No transfers found in the last {LOG_SCAN_RANGE.toLocaleString()} blocks.
            </p>
          )}
          {!transfersErr && !transfersLoading && transfers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium text-left">Tx Hash</th>
                    <th className="py-2 pr-3 font-medium text-left">Block</th>
                    <th className="py-2 pr-3 font-medium text-left">From</th>
                    <th className="py-2 pr-3 font-medium text-left">To</th>
                    <th className="py-2 pr-3 font-medium text-left">Value</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(odd)]:bg-slate-50/40 dark:[&>tr:nth-child(odd)]:bg-white/5">
                  {transfers.map((log) => (
                    <tr key={`${log.transactionHash}-${log.logIndex}`} className="border-b last:border-0 border-slate-100 dark:border-white/10">
                      <td className="py-2 pr-3"><MonoLink to={`/tx/${log.transactionHash}`}>{shortHash(log.transactionHash)}</MonoLink></td>
                      <td className="py-2 pr-3"><Link className="underline" to={`/block/${hexToInt(log.blockNumber)}`}>{hexToInt(log.blockNumber)}</Link></td>
                      <td className="py-2 pr-3"><MonoLink to={`/address/${topicToAddress(log.topics[1])}`}>{shortHash(topicToAddress(log.topics[1]))}</MonoLink></td>
                      <td className="py-2 pr-3"><MonoLink to={`/address/${topicToAddress(log.topics[2])}`}>{shortHash(topicToAddress(log.topics[2]))}</MonoLink></td>
                      <td className="py-2 pr-3">{formatUnits(decodeUint(log.data), token.decimals)} {token.symbol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {token && (
        <Card title="Holders">
          {holderScan.status === "idle" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Holder counts aren't indexed. Scanning walks the token's full transfer history directly from the
                chain via repeated log queries, which can issue hundreds of requests and take a while for a
                long-lived contract.
              </p>
              <button
                onClick={runHolderScan}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                Scan Full History for Holders
              </button>
            </div>
          )}

          {holderScan.status === "scanning" && (
            <div className="space-y-3">
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden dark:bg-white/10">
                <div
                  className="h-full bg-slate-900 dark:bg-white transition-all"
                  style={{ width: `${Math.min(100, (holderScan.blocksScanned / holderScan.totalBlocks) * 100)}%` }}
                />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Scanned {holderScan.blocksScanned.toLocaleString()} / {holderScan.totalBlocks.toLocaleString()} blocks
                · {holderScan.requestCount} requests · {holderScan.holderCountSoFar} holders found so far
              </p>
              <button
                onClick={() => { holderCancelRef.current = true; }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-white/10"
              >
                Cancel
              </button>
            </div>
          )}

          {(holderScan.status === "done" || holderScan.status === "cancelled" || holderScan.status === "error") && (
            <div className="space-y-3">
              {holderScan.status === "cancelled" && (
                <p className="text-sm text-amber-700 dark:text-amber-400">Scan cancelled — showing partial results.</p>
              )}
              {holderScan.status === "error" && <ErrorBanner error={holderScan.error} />}
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium">{holderScan.holderCount.toLocaleString()}</span>{" "}
                  holder{holderScan.holderCount === 1 ? "" : "s"}
                  {holderScan.status !== "done" && " (partial)"}
                </div>
                <button onClick={runHolderScan} className="text-sm underline">Rescan</button>
              </div>
              {holderScan.holders.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-3 font-medium text-left">#</th>
                        <th className="py-2 pr-3 font-medium text-left">Address</th>
                        <th className="py-2 pr-3 font-medium text-left">Balance</th>
                        <th className="py-2 pr-3 font-medium text-left">% of Supply</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr:nth-child(odd)]:bg-slate-50/40 dark:[&>tr:nth-child(odd)]:bg-white/5">
                      {holderScan.holders.slice(0, 100).map((h, i) => (
                        <tr key={h.address} className="border-b last:border-0 border-slate-100 dark:border-white/10">
                          <td className="py-2 pr-3">{i + 1}</td>
                          <td className="py-2 pr-3"><MonoLink to={`/address/${h.address}`}>{shortHash(h.address)}</MonoLink></td>
                          <td className="py-2 pr-3">{formatUnits(h.balance, token.decimals)} {token.symbol}</td>
                          <td className="py-2 pr-3">
                            {token.totalSupply > 0n ? (Number((h.balance * 10000n) / token.totalSupply) / 100).toFixed(2) : "0.00"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {holderScan.holders.length > 100 && (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Showing top 100 of {holderScan.holders.length.toLocaleString()} holders.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function BlockPage() {
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
        const hexNum = toHexFromInput(number);
        const b = await rpc("eth_getBlockByNumber", [hexNum, true]);
        if (!b) throw new Error("Block not found");
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

  return (
    <div className="space-y-6">
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Block" }, { label: `#${number}` }]} />
      <Card title="Block Summary">
        <ErrorBanner error={err} details={errDetails} />
        {!err && loading && <Loading />}
        {!err && !loading && block && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <Chip>Block <span className="font-mono">{hexToInt(block.number)}</span></Chip>
              <Chip>{formatTs(block.timestamp)}</Chip>
              <Chip>{block.transactions?.length ?? 0} tx</Chip>
            </div>
            <div className="grid gap-2">
              <Row label="Hash"><MonoLink to={`/block/${hexToInt(block.number)}`}>{block.hash}</MonoLink></Row>
              <Row label="Parent"><MonoLink to={`/block/${hexToInt(block.number) - 1}`}>{block.parentHash}</MonoLink></Row>
              <Row label="Miner"><MonoLink to={`/address/${block.miner}`}>{block.miner}</MonoLink></Row>
              <Row label="Timestamp">{formatTs(block.timestamp)}</Row>
              <Row label="# Txns">{block.transactions?.length ?? 0}</Row>
            </div>
          </>
        )}
      </Card>

      {!err && block?.transactions?.length ? (
        <Card title="Transactions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-[110px] z-10 bg-white/90 backdrop-blur dark:bg-black/60">
                <tr className="text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium text-left">Hash</th>
                  <th className="py-2 pr-3 font-medium text-left">From</th>
                  <th className="py-2 pr-3 font-medium text-left">To</th>
                  <th className="py-2 pr-3 font-medium text-left">Value</th>
                  <th className="py-2 pr-3 font-medium text-left">Gas</th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(odd)]:bg-slate-50/40 dark:[&>tr:nth-child(odd)]:bg-white/5">
                {block.transactions.map((tx) => (
                  <tr key={tx.hash} className="border-b last:border-0 border-slate-100 dark:border-white/10">
                    <td className="py-2 pr-3"><MonoLink to={`/tx/${tx.hash}`}>{shortHash(tx.hash)}</MonoLink></td>
                    <td className="py-2 pr-3"><MonoLink to={`/address/${tx.from}`}>{shortHash(tx.from)}</MonoLink></td>
                    <td className="py-2 pr-3">
                      {tx.to
                        ? <MonoLink to={`/address/${tx.to}`}>{shortHash(tx.to)}</MonoLink>
                        : <span className="italic text-slate-500">contract creation</span>}
                    </td>
                    <td className="py-2 pr-3">{fromWei(tx.value)} {CHAIN_CURRENCY}</td>
                    <td className="py-2 pr-3">{hexToInt(tx.gas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function TxPage() {
  const { hash } = useParams();
  const [tx, setTx] = useState(null);
  const [rcpt, setRcpt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [errDetails, setErrDetails] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null); setErrDetails(null);
        const t = await rpc("eth_getTransactionByHash", [hash]);
        const r = await rpc("eth_getTransactionReceipt", [hash]);
        if (!mounted) return;
        setTx(t);
        setRcpt(r);
      } catch (e) {
        if (!mounted) return;
        setErr(e.message || "Failed to load transaction");
        setErrDetails(e.details || null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [hash]);

  const status = useMemo(() => {
    if (!rcpt) return null;
    const s = hexToInt(rcpt.status);
    return s === 1 ? "Success" : s === 0 ? "Failed" : "Unknown";
  }, [rcpt]);

  return (
    <div className="space-y-6">
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Transaction" }, { label: shortHash(hash, 10) }]} />
      <Card title="Transaction Summary">
        <ErrorBanner error={err} details={errDetails} />
        {!err && loading && <Loading />}
        {!err && !loading && tx && (
          <div className="grid gap-2">
            <Row label="Hash"><Mono>{tx.hash}</Mono></Row>
            <Row label="Status">
              <Badge tone={status === "Success" ? "success" : status === "Failed" ? "danger" : "neutral"}>{status ?? "…"}</Badge>
            </Row>
            <Row label="Block">
              {rcpt?.blockNumber
                ? <Link className="underline" to={`/block/${hexToInt(rcpt.blockNumber)}`}>{hexToInt(rcpt.blockNumber)}</Link>
                : "Pending"}
            </Row>
            <Row label="From"><MonoLink to={`/address/${tx.from}`}>{tx.from}</MonoLink></Row>
            <Row label="To">
              {tx.to
                ? <MonoLink to={`/address/${tx.to}`}>{tx.to}</MonoLink>
                : <span className="italic text-slate-500">contract creation</span>}
            </Row>
            <Row label="Value">{fromWei(tx.value)} {CHAIN_CURRENCY}</Row>
            <Row label="Gas Price">{tx.gasPrice ? `${hexToInt(tx.gasPrice)} wei` : "-"}</Row>
            <Row label="Gas Limit">{hexToInt(tx.gas)}</Row>
            <Row label="Gas Used">{rcpt?.gasUsed ? hexToInt(rcpt.gasUsed) : "…"}</Row>
            <Row label="Nonce">{hexToInt(tx.nonce)}</Row>
            <Row label="Input Data">
              <details>
                <summary className="cursor-pointer select-none text-slate-600 dark:text-slate-300">show</summary>
                <pre className="overflow-x-auto bg-slate-50 p-2 rounded border border-slate-200 text-xs dark:bg-white/5 dark:border-white/10">{tx.input}</pre>
              </details>
            </Row>
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------
   Small helpers
------------------------------------------------------- */
function Row({ label, children }) {
  return (
    <div className="grid grid-cols-12 gap-3 py-1">
      <div className="col-span-12 md:col-span-3 text-slate-500 dark:text-slate-400">{label}</div>
      <div className="col-span-12 md:col-span-9 break-all">{children}</div>
    </div>
  );
}

function Mono({ children }) {
  return <code className="bg-slate-100 px-1.5 py-0.5 rounded whitespace-pre-wrap break-all dark:bg-white/10">{children}</code>;
}

function MonoLink({ to, children }) {
  return (
    <Link to={to} className="underline">
      <Mono>{children}</Mono>
    </Link>
  );
}

function Chip({ children }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs dark:bg-white/5 dark:border-white/10">{children}</div>;
}

/* -------------------------------------------------------
   URL compatibility gate
------------------------------------------------------- */
function CompatRouterGate() {
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    const qp = new URLSearchParams(loc.search);
    const tx = qp.get("tx");
    const block = qp.get("block");
    const addr = qp.get("address");
    if (tx && /^0x[a-fA-F0-9]{64}$/.test(tx)) nav(`/tx/${tx}`, { replace: true });
    else if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) nav(`/address/${addr}`, { replace: true });
    else if (block && /^[0-9]+$/.test(block)) nav(`/block/${block}`, { replace: true });
  }, [loc.search, nav]);
  return null;
}

/* -------------------------------------------------------
   App Root
------------------------------------------------------- */
function AppInner() {
  const { number: headNumber, ago } = useChainHead();
  return (
    <Shell latest={headNumber} timeAgo={ago}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="/block/:number" element={<BlockPage />} />
        <Route path="/tx/:hash" element={<TxPage />} />
        <Route path="/address/:address" element={<AddressPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
  );
}

function NotFound() {
  const loc = useLocation();
  return (
    <div className="space-y-4">
      <Card title="Not Found">
        <p>We couldn't find <code className="font-mono">{loc.pathname}</code>. Try the search above.</p>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CompatRouterGate />
      <AppInner />
    </BrowserRouter>
  );
}
