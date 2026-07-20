import React, { useEffect, useState } from "react";
import setupSolcMethods from "solc/wrapper";
import { ethers } from "ethers";
import { rpc, RPC_URL } from "../App";
import Loading from "./ui/Loading";
import ErrorBanner from "./ui/ErrorBanner";
import Badge from "./ui/Badge";

const SOLC_LIST_URL = "https://binaries.soliditylang.org/bin/list.json";

// Session-only: verifying isn't persisted anywhere, so it only lasts this page load.
const verifiedCache = new Map();

function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

// The trailing bytes of deployed EVM bytecode are a CBOR-encoded metadata blob
// (source hash, compiler version, ...); its own last 2 bytes give its length.
// Stripping it lets us compare code that's byte-identical except for that hash.
function stripMetadata(hexBytecode) {
  const hex = (hexBytecode || "").replace(/^0x/, "").toLowerCase();
  if (hex.length < 4) return hex;
  const metadataLen = parseInt(hex.slice(-4), 16);
  const cut = (metadataLen + 2) * 2;
  if (!Number.isFinite(metadataLen) || cut <= 0 || cut > hex.length) return hex;
  return hex.slice(0, hex.length - cut);
}

function loadSoljson(buildPath, { timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = `https://binaries.soliditylang.org/bin/${buildPath}`;
    const prevModule = window.Module;
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.Module = prevModule;
      fn(arg);
    };

    const timer = setTimeout(
      () => finish(reject, new Error("Timed out loading the Solidity compiler build.")),
      timeoutMs
    );

    window.Module = {
      onRuntimeInitialized() {
        const mod = window.Module;
        finish(resolve, mod);
      },
    };

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onerror = () => finish(reject, new Error(`Failed to fetch compiler build: ${buildPath}`));
    script.onload = () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
    document.head.appendChild(script);
  });
}

function coerceInput(type, raw) {
  const v = (raw ?? "").trim();
  if (type === "bool") return v === "true" || v === "1";
  if (type.endsWith("[]")) return JSON.parse(v || "[]");
  return v;
}

function stringifyResult(res) {
  if (typeof res === "bigint") return res.toString();
  if (Array.isArray(res)) return "[" + res.map(stringifyResult).join(", ") + "]";
  return String(res);
}

function ArgInputs({ inputs, values, onChange }) {
  if (!inputs.length) return null;
  return (
    <div className="grid gap-2 mb-2">
      {inputs.map((inp, i) => (
        <input
          key={i}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:bg-transparent dark:border-white/10"
          placeholder={`${inp.name || `arg${i}`} (${inp.type})`}
          value={values[i] ?? ""}
          onChange={(e) => onChange(i, e.target.value)}
        />
      ))}
    </div>
  );
}

function ReadFunction({ address, abi, fn }) {
  const [values, setValues] = useState(fn.inputs.map(() => ""));
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(address, abi, provider);
      const args = fn.inputs.map((inp, i) => coerceInput(inp.type, values[i]));
      const res = await contract[fn.name](...args);
      setResult(stringifyResult(res));
    } catch (e) {
      setErr(e.reason || e.shortMessage || e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
      <div className="text-sm font-mono mb-2">{fn.name}({fn.inputs.map((i) => i.type).join(", ")})</div>
      <ArgInputs inputs={fn.inputs} values={values} onChange={(i, v) => setValues((vs) => vs.map((x, idx) => (idx === i ? v : x)))} />
      <button onClick={run} disabled={loading} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-white/10">
        {loading ? "Querying…" : "Query"}
      </button>
      {result != null && <div className="mt-2 text-sm font-mono break-all">{result}</div>}
      {err && <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">{err}</div>}
    </div>
  );
}

function WriteFunction({ address, abi, fn }) {
  const [values, setValues] = useState(fn.inputs.map(() => ""));
  const [ethValue, setEthValue] = useState("");
  const [txHash, setTxHash] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const hasWallet = typeof window !== "undefined" && !!window.ethereum;

  const run = async () => {
    setLoading(true); setErr(null); setTxHash(null);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(address, abi, signer);
      const args = fn.inputs.map((inp, i) => coerceInput(inp.type, values[i]));
      const overrides = fn.stateMutability === "payable" && ethValue ? { value: ethers.parseEther(ethValue) } : {};
      const tx = await contract[fn.name](...args, overrides);
      setTxHash(tx.hash);
    } catch (e) {
      setErr(e.reason || e.shortMessage || e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
      <div className="text-sm font-mono mb-2">{fn.name}({fn.inputs.map((i) => i.type).join(", ")})</div>
      <ArgInputs inputs={fn.inputs} values={values} onChange={(i, v) => setValues((vs) => vs.map((x, idx) => (idx === i ? v : x)))} />
      {fn.stateMutability === "payable" && (
        <input
          className="mb-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:bg-transparent dark:border-white/10"
          placeholder="ALKE to send (optional)"
          value={ethValue}
          onChange={(e) => setEthValue(e.target.value)}
        />
      )}
      <button
        onClick={run}
        disabled={loading || !hasWallet}
        className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {loading ? "Sending…" : "Write"}
      </button>
      {!hasWallet && <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">No wallet detected</span>}
      {txHash && <div className="mt-2 text-sm font-mono break-all">Submitted: {txHash}</div>}
      {err && <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">{err}</div>}
    </div>
  );
}

function VerifiedContractUI({ address, verified }) {
  const readFns = verified.abi.filter((f) => f.type === "function" && (f.stateMutability === "view" || f.stateMutability === "pure"));
  const writeFns = verified.abi.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="success">{verified.matchType === "full" ? "Full match" : "Partial match"}</Badge>
        <span>Contract <span className="font-mono">{verified.contractName}</span> verified against compiler <span className="font-mono">{verified.compilerVersion}</span></span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        This verification ran in your browser only — it isn't saved anywhere, so other visitors won't see it verified unless they run it themselves.
      </p>
      {readFns.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Read Contract</div>
          <div className="grid gap-2">
            {readFns.map((fn, i) => <ReadFunction key={i} address={address} abi={verified.abi} fn={fn} />)}
          </div>
        </div>
      )}
      {writeFns.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Write Contract</div>
          <div className="grid gap-2">
            {writeFns.map((fn, i) => <WriteFunction key={i} address={address} abi={verified.abi} fn={fn} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ContractVerify({ address }) {
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState([]);
  const [version, setVersion] = useState("");
  const [source, setSource] = useState("");
  const [optimizer, setOptimizer] = useState(true);
  const [runs, setRuns] = useState("200");
  const [status, setStatus] = useState("idle"); // idle | loading-compiler | compiling | mismatch | error
  const [messages, setMessages] = useState([]);
  const [compiledNames, setCompiledNames] = useState([]);
  const [verified, setVerified] = useState(() => verifiedCache.get(address) || null);

  useEffect(() => {
    setVerified(verifiedCache.get(address) || null);
    setStatus("idle");
    setMessages([]);
  }, [address]);

  useEffect(() => {
    if (!open || releases.length) return;
    fetch(SOLC_LIST_URL)
      .then((r) => r.json())
      .then((data) => {
        const list = Object.entries(data.releases || {})
          .map(([v, path]) => ({ version: v, path }))
          .sort((a, b) => compareSemver(b.version, a.version));
        setReleases(list);
        if (list.length) setVersion(list[0].version);
      })
      .catch(() => setMessages(["Failed to load the compiler version list."]));
  }, [open, releases.length]);

  async function handleVerify() {
    setStatus("loading-compiler");
    setMessages([]);
    setCompiledNames([]);
    try {
      const release = releases.find((r) => r.version === version);
      if (!release) throw new Error("Pick a compiler version.");
      const soljsonModule = await loadSoljson(release.path);

      setStatus("compiling");
      const solc = setupSolcMethods(soljsonModule);
      const input = {
        language: "Solidity",
        sources: { "Contract.sol": { content: source } },
        settings: {
          optimizer: { enabled: optimizer, runs: Number(runs) || 200 },
          outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } },
        },
      };
      const output = JSON.parse(solc.compile(JSON.stringify(input)));
      const errors = (output.errors || []).filter((e) => e.severity === "error");
      if (errors.length) {
        setStatus("error");
        setMessages(errors.map((e) => e.formattedMessage || e.message));
        return;
      }
      const fileOut = output.contracts && output.contracts["Contract.sol"];
      if (!fileOut || !Object.keys(fileOut).length) {
        throw new Error("Compiler produced no contracts from this source.");
      }

      const liveCode = await rpc("eth_getCode", [address, "latest"]);
      const strippedLive = stripMetadata(liveCode);

      let match = null;
      for (const [name, c] of Object.entries(fileOut)) {
        const rt = c.evm?.deployedBytecode?.object;
        if (!rt) continue;
        const fullMatch = ("0x" + rt).toLowerCase() === (liveCode || "").toLowerCase();
        const strippedC = stripMetadata(rt);
        const partialMatch = strippedC.length > 0 && strippedC === strippedLive;
        if (fullMatch || partialMatch) {
          match = { name, abi: c.abi, matchType: fullMatch ? "full" : "partial" };
          break;
        }
      }

      if (!match) {
        setStatus("mismatch");
        setCompiledNames(Object.keys(fileOut));
        return;
      }

      const result = { abi: match.abi, contractName: match.name, compilerVersion: version, matchType: match.matchType };
      verifiedCache.set(address, result);
      setVerified(result);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setMessages([e.message || String(e)]);
    }
  }

  if (verified) {
    return <VerifiedContractUI address={address} verified={verified} />;
  }

  if (!open) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This contract hasn't been verified. Verification compiles your source directly in this browser (no
          data leaves your machine except fetching the public compiler build) and checks it against the live
          on-chain bytecode. It isn't saved anywhere — each visitor who wants to see it verified has to run it
          themselves.
        </p>
        <button onClick={() => setOpen(true)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          Verify Contract Source
        </button>
      </div>
    );
  }

  const busy = status === "loading-compiler" || status === "compiling";

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:bg-transparent dark:border-white/10"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          disabled={busy}
        >
          {releases.length === 0 && <option>Loading versions…</option>}
          {releases.map((r) => <option key={r.version} value={r.version}>v{r.version}</option>)}
        </select>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={optimizer} onChange={(e) => setOptimizer(e.target.checked)} disabled={busy} />
            Optimizer
          </label>
          <input
            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:bg-transparent dark:border-white/10"
            value={runs}
            onChange={(e) => setRuns(e.target.value)}
            disabled={busy || !optimizer}
          />
          <span className="text-slate-500 dark:text-slate-400">runs</span>
        </div>
      </div>
      <textarea
        className="w-full h-56 rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs dark:bg-transparent dark:border-white/10"
        placeholder="Paste the full flattened Solidity source (single file, no imports)…"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        disabled={busy}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleVerify}
          disabled={busy || !source.trim() || !version}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {status === "loading-compiler" ? "Loading compiler…" : status === "compiling" ? "Compiling…" : "Compile & Verify"}
        </button>
        {busy && <Loading label={status === "loading-compiler" ? "Fetching compiler build…" : "Compiling…"} />}
      </div>

      {status === "mismatch" && (
        <ErrorBanner error={`Compiled bytecode didn't match. Compiled contract(s): ${compiledNames.join(", ") || "none"}. Check the compiler version, optimizer settings, and that the source is the exact deployed file.`} />
      )}
      {status === "error" && messages.map((m, i) => <ErrorBanner key={i} error={m} />)}
    </div>
  );
}
