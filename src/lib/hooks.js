import { useEffect, useRef, useState } from "react";
import { rpc, rpcBatch } from "./rpc";
import { hexToInt, intToHex } from "./format";

/* Latest block number + timestamp, polled. */
export function useChainHead(intervalMs = 12000) {
  const [head, setHead] = useState({ number: null, ts: null });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const blk = await rpc("eth_getBlockByNumber", ["latest", false]);
        if (mounted && blk) setHead({ number: hexToInt(blk.number), ts: hexToInt(blk.timestamp) });
      } catch {
        // ignore banner hiccups
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => { mounted = false; clearInterval(id); };
  }, [intervalMs]);

  return head;
}

/* The most recent `count` blocks (with full txs) + gas price, polled.
   Already-fetched blocks are cached so each poll only asks for new ones. */
export function useLatestBlocks(count = 10, intervalMs = 8000) {
  const [state, setState] = useState({ blocks: [], gasPrice: null, error: null, loading: true });
  const cache = useRef(new Map());

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [latestHex, gasPrice] = await rpcBatch([["eth_blockNumber"], ["eth_gasPrice"]]);
        const latest = hexToInt(latestHex);
        const wanted = [];
        for (let n = latest; n > latest - count && n >= 0; n--) wanted.push(n);
        const missing = wanted.filter((n) => !cache.current.has(n));
        const fetched = await rpcBatch(missing.map((n) => ["eth_getBlockByNumber", [intToHex(n), true]]));
        fetched.forEach((b, i) => b && cache.current.set(missing[i], b));
        for (const n of cache.current.keys()) if (n <= latest - count) cache.current.delete(n);
        const blocks = wanted.map((n) => cache.current.get(n)).filter(Boolean);
        if (mounted) setState({ blocks, gasPrice, error: null, loading: false });
      } catch (e) {
        if (mounted) setState((s) => ({ ...s, error: e.message, loading: false }));
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => { mounted = false; clearInterval(id); };
  }, [count, intervalMs]);

  return state;
}

/* Transactions are sparse on this chain, so the latest few blocks are often
   empty. Walk back (header-only, in batches) once to find the most recent
   transactions, then load just the blocks that have some. */
export function useRecentTxs({ want = 10, lookback = 10000, batch = 500 } = {}) {
  const [state, setState] = useState({ txs: [], scanning: true, scannedBlocks: 0 });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const latest = hexToInt(await rpc("eth_blockNumber"));
        const withTxs = [];
        let txCount = 0;
        let cursor = latest;
        const floor = Math.max(0, latest - lookback);
        while (cursor > floor && txCount < want && mounted) {
          const nums = [];
          for (let n = cursor; n > Math.max(floor, cursor - batch); n--) nums.push(n);
          const headers = await rpcBatch(nums.map((n) => ["eth_getBlockByNumber", [intToHex(n), false]]), { timeoutMs: 20000 });
          for (const h of headers) {
            if (h?.transactions?.length) { withTxs.push(h.number); txCount += h.transactions.length; }
          }
          cursor -= batch;
          const scannedBlocks = latest - Math.max(cursor, floor);
          if (mounted) setState((s) => ({ ...s, scannedBlocks }));
        }
        const full = await rpcBatch(withTxs.map((n) => ["eth_getBlockByNumber", [n, true]]));
        const txs = full
          .filter(Boolean)
          .flatMap((b) => b.transactions.map((tx) => ({ tx, ts: hexToInt(b.timestamp) })))
          .slice(0, want);
        if (mounted) setState({ txs, scanning: false, scannedBlocks: latest - Math.max(cursor, floor) });
      } catch {
        if (mounted) setState((s) => ({ ...s, scanning: false }));
      }
    })();
    return () => { mounted = false; };
  }, [want, lookback, batch]);

  return state;
}

/* Re-render every `ms` so relative times ("12s ago") stay fresh. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
