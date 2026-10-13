import { rpc } from "./rpc";
import { hexToBig } from "./format";

export const ERC20_SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
};
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const topicToAddress = (topic) => "0x" + topic.slice(-40);

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
export function decodeAbiString(hex) {
  if (!hex || hex === "0x") return "";
  const clean = hex.slice(2);
  if (clean.length <= 64) return hexToAscii(clean.replace(/0+$/, clean.length % 2 ? "0" : ""));
  const length = parseInt(clean.slice(64, 128), 16);
  return hexToAscii(clean.slice(128, 128 + length * 2));
}

// ERC-20 Transfer has from/to indexed (3 topics); ERC-721 also indexes the
// token id (4 topics), so the topic count tells them apart.
export function isErc20Transfer(log) {
  return log.topics?.[0] === TRANSFER_TOPIC && log.topics.length === 3;
}

// Returns { name, symbol, decimals, totalSupply } or null if not an ERC-20.
export async function probeErc20(address) {
  const call = (data) => rpc("eth_call", [{ to: address, data }, "latest"]);
  const [nameRes, symbolRes, decimalsRes, supplyRes] = await Promise.allSettled([
    call(ERC20_SELECTORS.name),
    call(ERC20_SELECTORS.symbol),
    call(ERC20_SELECTORS.decimals),
    call(ERC20_SELECTORS.totalSupply),
  ]);
  const ok = (r) => r.status === "fulfilled" && r.value && r.value !== "0x";
  // A real ERC-20 must at least expose symbol, decimals, and totalSupply.
  if (!ok(symbolRes) || !ok(decimalsRes) || !ok(supplyRes)) return null;
  return {
    name: ok(nameRes) ? decodeAbiString(nameRes.value) : "",
    symbol: decodeAbiString(symbolRes.value),
    decimals: Number(hexToBig(decimalsRes.value)),
    totalSupply: hexToBig(supplyRes.value),
  };
}
