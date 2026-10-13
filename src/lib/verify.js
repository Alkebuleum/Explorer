import { compileInWorker } from "./solcClient";
import { AbiCoder } from "ethers";
import { rpc, CHAIN_ID } from "./rpc";

const SOLC_BIN = "https://binaries.soliditylang.org/bin";

export const EVM_VERSIONS = [
  "prague", "cancun", "shanghai", "paris", "london", "berlin", "istanbul",
  "petersburg", "constantinople", "byzantium", "spuriousDragon", "tangerineWhistle", "homestead",
];

/* -------------------------------------------------------
   Compiler loading
------------------------------------------------------- */
function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

let releasesPromise = null;
export function fetchReleases() {
  releasesPromise ||= fetch(`${SOLC_BIN}/list.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) =>
      Object.entries(data.releases || {})
        .map(([version, path]) => ({ version, path }))
        .sort((a, b) => compareSemver(b.version, a.version))
    )
    .catch((e) => {
      releasesPromise = null;
      throw new Error(`Failed to load the Solidity compiler list (${e.message}).`);
    });
  return releasesPromise;
}

// Accepts "0.8.24", "v0.8.24" or "v0.8.24+commit.e11b9ed9".
export function normalizeVersion(v) {
  const m = String(v || "").match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : "";
}

async function releaseUrl(version) {
  const v = normalizeVersion(version);
  const release = (await fetchReleases()).find((r) => r.version === v);
  if (!release) throw new Error(`Solidity ${v} isn't a published compiler release.`);
  return `${SOLC_BIN}/${release.path}`;
}

/* -------------------------------------------------------
   Compiler input
------------------------------------------------------- */
export function parseStandardJson(text) {
  let input;
  try {
    input = JSON.parse(text);
  } catch (e) {
    throw new Error(`That isn't valid JSON: ${e.message}`);
  }
  // Some tools wrap the standard input, e.g. { input: {...} } or { solcInput: {...} }.
  if (!input.sources && (input.input?.sources || input.solcInput?.sources)) input = input.input || input.solcInput;
  if (!input.sources || typeof input.sources !== "object") {
    throw new Error('Standard JSON input must have a "sources" object.');
  }
  const missing = Object.entries(input.sources).filter(([, s]) => typeof s?.content !== "string").map(([p]) => p);
  if (missing.length) {
    throw new Error(`These sources have no inline "content" (URLs aren't supported): ${missing.slice(0, 5).join(", ")}`);
  }
  return { language: input.language || "Solidity", sources: input.sources, settings: input.settings || {} };
}

export function buildSingleFileInput({ source, optimizer, runs, evmVersion, viaIR }) {
  const settings = { optimizer: { enabled: optimizer, runs: Number(runs) || 200 } };
  if (evmVersion) settings.evmVersion = evmVersion;
  if (viaIR) settings.viaIR = true;
  return { language: "Solidity", sources: { "Contract.sol": { content: source } }, settings };
}

export function describeSettings(settings = {}) {
  return {
    optimizer: !!settings.optimizer?.enabled,
    runs: settings.optimizer?.runs ?? 200,
    evmVersion: settings.evmVersion || "compiler default",
    viaIR: !!settings.viaIR,
  };
}

/* -------------------------------------------------------
   Bytecode matching
------------------------------------------------------- */
const strip0x = (h) => (h || "").replace(/^0x/, "").toLowerCase();

// The trailing bytes of deployed EVM bytecode are a CBOR-encoded metadata blob
// (source hash, compiler version, ...); its own last 2 bytes give its length.
// Stripping it lets us compare code that's byte-identical except for that hash.
function stripMetadata(hex) {
  if (hex.length < 4) return hex;
  const metadataLen = parseInt(hex.slice(-4), 16);
  const cut = (metadataLen + 2) * 2;
  if (!Number.isFinite(metadataLen) || cut <= 0 || cut > hex.length) return hex;
  return hex.slice(0, hex.length - cut);
}

// Solidity stores its version in the metadata as CBOR `"solc": h'XXYYZZ'`
// (text(4) "solc" = 64736f6c63, then bytes(3) = 43). Pre-release builds store a
// string instead, which we don't try to map. Returns e.g. "0.8.28" or null.
export function compilerVersionFromCode(hexCode) {
  const hex = strip0x(hexCode);
  if (hex.length < 4) return null;
  const len = parseInt(hex.slice(-4), 16);
  const cbor = hex.slice(Math.max(0, hex.length - (len + 2) * 2), -4);
  const i = cbor.lastIndexOf("64736f6c6343");
  if (i < 0) return null;
  const v = cbor.slice(i + 12, i + 18);
  return v.length === 6 ? [0, 2, 4].map((k) => parseInt(v.slice(k, k + 2), 16)).join(".") : null;
}

export async function detectCompilerVersion(address) {
  return compilerVersionFromCode(await rpc("eth_getCode", [address, "latest"]));
}

function zeroRange(hex, startByte, lengthBytes) {
  const s = startByte * 2;
  const e = s + lengthBytes * 2;
  return hex.slice(0, s) + "0".repeat(e - s) + hex.slice(e);
}

// Compiled runtime code leaves zeros where `immutable` values go and
// `__$…$__` placeholders where linked library addresses go. Mask the same
// spots in the live code so those deploy-time values don't block a match.
export function compareRuntime(compiledHex, immutableReferences, liveHex) {
  let compiled = strip0x(compiledHex);
  let live = strip0x(liveHex);
  if (!compiled || !live || compiled.length !== live.length) return null;

  for (const refs of Object.values(immutableReferences || {})) {
    for (const { start, length } of refs) live = zeroRange(live, start, length);
  }
  const placeholder = /__\$[0-9a-f]{34}\$__/g;
  let m;
  while ((m = placeholder.exec(compiled))) {
    compiled = compiled.slice(0, m.index) + "0".repeat(40) + compiled.slice(m.index + 40);
    live = live.slice(0, m.index) + "0".repeat(40) + live.slice(m.index + 40);
  }

  if (compiled === live) return "full";
  const sc = stripMetadata(compiled);
  if (sc.length > 0 && sc === stripMetadata(live)) return "partial";
  return null;
}

/* -------------------------------------------------------
   Constructor arguments
------------------------------------------------------- */
async function readConstructorArgs({ creationTxHash, address, creationBytecode, abi }) {
  const [tx, rcpt] = await Promise.all([
    rpc("eth_getTransactionByHash", [creationTxHash]),
    rpc("eth_getTransactionReceipt", [creationTxHash]),
  ]);
  if (!tx) throw new Error("Deployment transaction not found.");
  // Direct deployments name the contract in the receipt; factory/CREATE2
  // deployments don't, so we can't read args from their input.
  if (tx.to || rcpt?.contractAddress?.toLowerCase() !== address.toLowerCase()) {
    throw new Error("That transaction didn't directly deploy this contract (factory deployments aren't supported for constructor-argument checks).");
  }
  const input = strip0x(tx.input);
  const creation = strip0x(creationBytecode);
  if (input.length < creation.length) throw new Error("Deployment input is shorter than the compiled creation code.");
  const argsHex = input.slice(creation.length);

  const ctor = abi.find((f) => f.type === "constructor");
  const types = ctor?.inputs || [];
  let decoded = [];
  if (types.length) {
    try {
      const values = AbiCoder.defaultAbiCoder().decode(types, "0x" + argsHex);
      decoded = types.map((t, i) => ({ name: t.name, type: t.type, value: stringifyAbiValue(values[i]) }));
    } catch (e) {
      throw new Error(`Couldn't decode constructor arguments from the deployment input: ${e.shortMessage || e.message}`);
    }
  } else if (argsHex.length) {
    throw new Error("Deployment input has extra bytes, but this contract has no constructor arguments.");
  }
  return { hex: argsHex, decoded, exactCreationMatch: input.startsWith(creation) };
}

export function stringifyAbiValue(v) {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v) || (v && typeof v.toArray === "function")) {
    const arr = typeof v.toArray === "function" ? v.toArray() : v;
    return "[" + arr.map(stringifyAbiValue).join(", ") + "]";
  }
  return String(v);
}

/* -------------------------------------------------------
   End-to-end verification
------------------------------------------------------- */
export async function verifyContract({ address, input, compilerVersion, contractHint, creationTxHash, onStep = () => { } }) {
  const version = normalizeVersion(compilerVersion);
  if (!version) throw new Error("Pick a compiler version.");

  onStep("Fetching on-chain bytecode");
  const liveCode = await rpc("eth_getCode", [address, "latest"]);
  if (!liveCode || liveCode === "0x") throw new Error("There's no contract code at this address.");
  // Same executable code can come out of several compiler versions, but the
  // published record must name the one actually used.
  const deployedWith = compilerVersionFromCode(liveCode);
  if (deployedWith && deployedWith !== version) {
    throw new Error(`This contract was compiled with Solidity ${deployedWith} (recorded in its bytecode), but ${version} is selected. Pick v${deployedWith}.`);
  }

  const url = await releaseUrl(version);
  onStep(`Compiling with Solidity ${version} (large projects can take a minute)`);
  const compileInput = {
    ...input,
    settings: {
      ...input.settings,
      outputSelection: {
        "*": { "*": ["abi", "metadata", "evm.bytecode.object", "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"] },
      },
    },
  };
  const output = JSON.parse(await compileInWorker(url, compileInput));
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    const err = new Error("The source didn't compile.");
    err.compilerErrors = errors.map((e) => e.formattedMessage || e.message);
    throw err;
  }

  onStep("Comparing with on-chain bytecode");
  const candidates = [];
  for (const [path, contracts] of Object.entries(output.contracts || {})) {
    for (const [name, c] of Object.entries(contracts)) {
      if (!c.evm?.deployedBytecode?.object) continue; // interfaces / abstract
      candidates.push({ path, name, c });
    }
  }
  const hint = (contractHint || "").trim();
  const filtered = hint
    ? candidates.filter(({ path, name }) => name === hint || `${path}:${name}` === hint)
    : candidates;
  if (hint && !filtered.length) throw new Error(`No compiled contract named "${hint}".`);

  let match = null;
  for (const cand of filtered) {
    const t = compareRuntime(cand.c.evm.deployedBytecode.object, cand.c.evm.deployedBytecode.immutableReferences, liveCode);
    if (t) { match = { ...cand, matchType: t }; break; }
  }
  if (!match) {
    const err = new Error("Compiled bytecode doesn't match the contract on chain.");
    err.compiledNames = candidates.map(({ path, name }) => `${path}:${name}`);
    throw err;
  }

  // Publish only the files this contract was built from (its metadata lists
  // them), not the rest of the project the Standard JSON happened to include.
  let usedPaths = Object.keys(input.sources);
  try {
    const metaSources = Object.keys(JSON.parse(match.c.metadata).sources || {});
    if (metaSources.length) usedPaths = metaSources.filter((p) => input.sources[p]);
  } catch { }

  let constructorArgs = null;
  let constructorArgsError = null;
  if (creationTxHash?.trim()) {
    onStep("Checking constructor arguments");
    try {
      constructorArgs = await readConstructorArgs({
        creationTxHash: creationTxHash.trim(),
        address,
        creationBytecode: match.c.evm.bytecode.object,
        abi: match.c.abi,
      });
    } catch (e) {
      constructorArgsError = e.message;
    }
  }

  return {
    chainId: CHAIN_ID,
    address: address.toLowerCase(),
    contractName: match.name,
    sourcePath: match.path,
    compilerVersion: version,
    language: input.language || "Solidity",
    settings: input.settings || {},
    matchType: match.matchType,
    abi: match.c.abi,
    sources: Object.fromEntries(usedPaths.map((p) => [p, input.sources[p].content])),
    constructorArgs,
    constructorArgsError,
    creationTx: creationTxHash?.trim() || null,
    verifiedAt: new Date().toISOString(),
  };
}

// Rebuilds the Standard JSON input so anyone can recompile a verified contract.
export function toStandardJson(record) {
  return {
    language: record.language,
    sources: Object.fromEntries(Object.entries(record.sources).map(([p, content]) => [p, { content }])),
    settings: record.settings,
  };
}
