/* -------------------------------------------------------
   Chain config
------------------------------------------------------- */
export const RPC_URL = "https://rpc.alkebuleum.com";
export const CHAIN_ID = 237422;
export const CHAIN_NAME = "Alkebuleum Mainnet";
export const CHAIN_CURRENCY = "ALKE";

/* -------------------------------------------------------
   RPC util (timeout + structured errors)
------------------------------------------------------- */
let _reqId = 1;

async function post(body, { timeoutMs }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw makeRpcError({ type: "HTTP", status: res.status, statusText: res.statusText, body: text });
    }
    try {
      return await res.json();
    } catch (_e) {
      throw makeRpcError({ type: "BAD_JSON" });
    }
  } catch (err) {
    if (err.name === "AbortError") throw makeRpcError({ type: "TIMEOUT", timeoutMs });
    if (!err.__isRpcError) throw makeRpcError({ type: "NETWORK", raw: String(err) });
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export async function rpc(method, params = [], { timeoutMs = 10000 } = {}) {
  try {
    const data = await post({ jsonrpc: "2.0", id: _reqId++, method, params }, { timeoutMs });
    if (data?.error) {
      throw makeRpcError({ type: "RPC", code: data.error.code, message: data.error.message, data: data.error.data });
    }
    return data.result;
  } catch (err) {
    err.details = { ...err.details, method, params };
    throw err;
  }
}

// Sends several calls in one HTTP request. Returns results in call order;
// a failed call yields `null` rather than rejecting the whole batch.
export async function rpcBatch(calls, { timeoutMs = 15000 } = {}) {
  if (!calls.length) return [];
  const base = _reqId;
  _reqId += calls.length;
  const body = calls.map(([method, params = []], i) => ({ jsonrpc: "2.0", id: base + i, method, params }));
  const data = await post(body, { timeoutMs });
  const byId = new Map((Array.isArray(data) ? data : []).map((r) => [r.id, r]));
  return calls.map((_, i) => byId.get(base + i)?.result ?? null);
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
    case "TIMEOUT": return `RPC timeout after ${Math.round(info.timeoutMs / 1000)}s.`;
    case "NETWORK": return `Network error reaching RPC: ${info.raw}`;
    default: return "Unknown RPC error.";
  }
}
