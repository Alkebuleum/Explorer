// Where a wallet payment's ALKE comes from. Pure (no React) so it can be
// shared by the wallet provider and the balance line, and unit-tested.
import { rpc } from "./rpc";
import { shortHash } from "./format";

export const toAlke = (wei) => (Number(wei / 10n ** 15n) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });
export const balanceOf = async (addr) => BigInt(await rpc("eth_getBalance", [addr, "latest"]));
const PRIMARY_SELECTOR = "0xc6dbdf61"; // primary()

// ALKE the signer key keeps for gas when it pays or tops up the Nuru Account.
export const SIGNER_GAS_BUFFER = 5n * 10n ** 16n; // 0.05 ALKE

// Decides where a payment of `value` comes from. For a Nuru connection, in order:
//   account     — the Nuru Account covers it (the default, as in JollofSwap)
//   signer      — the signer key pays directly, keeping a gas buffer (only when
//                 the payer doesn't matter, i.e. `allowSigner`)
//   consolidate — move the shortfall from the signer into the Nuru Account, then pay
//   short       — even together they can't cover it
// Other wallets have one account: "wallet" or "short". Null when we can't tell
// (a Nuru session without its Nuru Account address).
export async function planPayment(c, value, { allowSigner = false } = {}) {
    const isNuru = c.type === "nuru" || c.type === "nuru-browser";
    if (!isNuru) {
        const balance = await balanceOf(c.address);
        return { isNuru, mode: balance >= value ? "wallet" : "short", account: balance, value };
    }
    if (!c.signer || c.address.toLowerCase() === c.signer.toLowerCase()) return null;
    const [account, signer, primary] = await Promise.all([
        balanceOf(c.address),
        balanceOf(c.signer),
        rpc("eth_call", [{ to: c.address, data: PRIMARY_SELECTOR }, "latest"]).catch(() => null),
    ]);
    // The primary key pays gas for execute(); linked keys go through the gasless relay.
    const isPrimary = !!primary && primary.length >= 66 && ("0x" + primary.slice(-40)).toLowerCase() === c.signer.toLowerCase();
    const plan = { isNuru, account, signer, value, topUp: 0n, gasKeyEmpty: isPrimary && signer === 0n };
    if (account >= value && !plan.gasKeyEmpty) return { ...plan, mode: "account" };
    if (allowSigner && signer >= value + SIGNER_GAS_BUFFER) return { ...plan, mode: "signer" };
    const topUp = value > account ? value - account : 0n;
    if (topUp > 0n && signer >= topUp + SIGNER_GAS_BUFFER) return { ...plan, mode: "consolidate", topUp };
    return { ...plan, mode: "short" };
}

export function shortMessage(c, p) {
    if (!p.isNuru) {
        return `Your wallet (${shortHash(c.address)}) holds ${toAlke(p.account)} ALKE, but this payment needs ${toAlke(p.value)} ALKE plus a little for gas. Top it up and try again.`;
    }
    if (p.account >= p.value && p.gasKeyEmpty) {
        return `Your Nuru signing key (${shortHash(c.signer)}) has no ALKE to pay gas. Send it a small amount of ALKE and try again.`;
    }
    return `Not enough ALKE: your Nuru Account holds ${toAlke(p.account)} and your signer key ${toAlke(p.signer)}, but this payment needs ${toAlke(p.value)} ` +
        `(the signer also keeps ${toAlke(SIGNER_GAS_BUFFER)} for gas). Add ALKE to your Nuru Account and try again.`;
}
