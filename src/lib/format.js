export const hexToInt = (h) => (h ? parseInt(h, 16) : 0);
export const hexToBig = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
export const intToHex = (n) => "0x" + BigInt(n).toString(16);
export const shortHash = (h, l = 6) => (h ? `${h.slice(0, 2 + l)}…${h.slice(-l)}` : "-");
export const formatTs = (hexTs) => new Date(hexToInt(hexTs) * 1000).toLocaleString();
export const ZERO_ADDRESS = "0x" + "0".repeat(40);

export function timeAgo(unixSeconds) {
  if (!unixSeconds) return "—";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function addCommas(numStr) {
  const [whole, frac] = numStr.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${withCommas}.${frac}` : withCommas;
}

// Exact BigInt -> decimal string; `maxFrac` trims long fractions for display.
export function formatUnits(value, decimals, maxFrac) {
  value = BigInt(value);
  const neg = value < 0n;
  if (neg) value = -value;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  let fracStr = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  if (maxFrac != null && fracStr.length > maxFrac) fracStr = fracStr.slice(0, maxFrac).replace(/0+$/, "");
  const s = addCommas(whole.toString()) + (fracStr ? "." + fracStr : "");
  return neg ? "-" + s : s;
}

export const formatNative = (hexOrBig, maxFrac = 6) => formatUnits(typeof hexOrBig === "string" ? hexToBig(hexOrBig) : hexOrBig, 18, maxFrac);

export function formatGwei(hexWei) {
  return formatUnits(hexToBig(hexWei), 9, 4);
}

// Picks wei or Gwei so tiny gas prices don't round down to "0 Gwei".
export function formatGasPrice(hexWei) {
  const wei = hexToBig(hexWei);
  return wei < 10n ** 6n ? `${wei.toLocaleString()} wei` : `${formatGwei(hexWei)} Gwei`;
}

// decimal (with/without commas), hex, number, BigInt
export function toHexFromInput(v) {
  if (typeof v === "number" || typeof v === "bigint") return "0x" + v.toString(16);
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (/^0x[0-9a-fA-F]+$/.test(s)) return s.toLowerCase();
    if (/^[0-9]+$/.test(s)) return "0x" + BigInt(s).toString(16);
  }
  throw new Error(`Invalid block identifier: ${v}`);
}
