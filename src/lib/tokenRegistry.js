// Read-only view of the ecosystem token registry (`tokens` collection), which
// JollofSwap and Nuru write to. AlkeScan never writes here.
import { collection, getDocs } from "firebase/firestore/lite";
import { db } from "./firebase";
import { CHAIN_ID } from "./rpc";
import { ZERO_ADDRESS } from "./format";

// JollofSwap stores some logos as site-relative paths (e.g. "/mahlogo.png").
const LOGO_BASE = "https://jollofswap.com";

function normalize(d) {
  const address = String(d.address || "").trim();
  const logo = String(d.logoUrl || "").trim();
  return {
    address,
    addressLower: address.toLowerCase(),
    symbol: String(d.symbol || "").trim().toUpperCase(),
    name: String(d.name || "").trim(),
    decimals: Number(d.decimals ?? 18),
    description: String(d.description || "").trim(),
    website: /^https?:\/\//i.test(d.website || "") ? d.website : "",
    logoUrl: logo.startsWith("/") && !logo.startsWith("//") ? LOGO_BASE + logo : /^https?:\/\//i.test(logo) ? logo : "",
    status: String(d.status || "Registered"),
    isNative: !!d.isNative || address.toLowerCase() === ZERO_ADDRESS,
    createdAtMs: Number(d.createdAtMs || 0),
  };
}

let registryPromise = null;

// All registered tokens on this chain, keyed by lowercase address. Cached for
// the session; failures resolve to an empty registry so pages still render.
export function fetchRegistry() {
  registryPromise ||= getDocs(collection(db, "tokens"))
    .then((snap) => {
      const map = new Map();
      snap.forEach((doc) => {
        const d = doc.data();
        if (Number(d.chainId) !== CHAIN_ID) return;
        const t = normalize(d);
        if (t.symbol) map.set(t.addressLower, t);
      });
      return map;
    })
    .catch((e) => {
      registryPromise = null;
      console.warn("[AlkeScan] token registry unavailable:", e.message);
      return new Map();
    });
  return registryPromise;
}

// Drop the cache so the next read picks up a new listing.
export function refreshRegistry() {
  registryPromise = null;
}

export async function getRegistryToken(address) {
  return (await fetchRegistry()).get(address.toLowerCase()) || null;
}

// "verified" / "flagged" / everything else (Registered, Core, …)
export function registryTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "verified" || s === "core") return "success";
  if (s === "flagged") return "danger";
  return "neutral";
}
