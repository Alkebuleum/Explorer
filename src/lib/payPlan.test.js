import { planPayment, SIGNER_GAS_BUFFER } from "./payPlan";
import { rpc } from "./rpc";

jest.mock("./rpc", () => ({ rpc: jest.fn() }));

const E = 10n ** 18n;
const ACCOUNT = "0x0f6dC06DB23aE3dcf7d11784C46FA228c471442e";
const SIGNER = "0x26b0Ca2c767758fC3E34e0481065a55521e42baB";
const conn = { type: "nuru-browser", address: ACCOUNT, signer: SIGNER };
const pad = (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");

function chain({ account, signer, primary = SIGNER }) {
    rpc.mockImplementation(async (method, params) => {
        if (method === "eth_getBalance") return "0x" + (params[0].toLowerCase() === ACCOUNT.toLowerCase() ? account : signer).toString(16);
        if (method === "eth_call") return pad(primary);
        throw new Error(method);
    });
}

test("Nuru Account covers it", async () => {
    chain({ account: 3000n * E, signer: E });
    expect((await planPayment(conn, 2000n * E)).mode).toBe("account");
});

test("signer pays when allowed and the account is short", async () => {
    chain({ account: 100n * E, signer: 2500n * E });
    expect((await planPayment(conn, 2000n * E, { allowSigner: true })).mode).toBe("signer");
});

test("tops up the account when the signer can't pay alone or isn't allowed", async () => {
    chain({ account: 1500n * E, signer: 600n * E });
    const p = await planPayment(conn, 2000n * E, { allowSigner: true });
    expect(p.mode).toBe("consolidate");
    expect(p.topUp).toBe(500n * E);

    chain({ account: 100n * E, signer: 2500n * E });
    const q = await planPayment(conn, 2000n * E);
    expect(q.mode).toBe("consolidate");
    expect(q.topUp).toBe(1900n * E);
});

test("keeps the signer's gas buffer", async () => {
    chain({ account: 1500n * E, signer: 500n * E + SIGNER_GAS_BUFFER - 1n });
    expect((await planPayment(conn, 2000n * E)).mode).toBe("short");
    chain({ account: 1500n * E, signer: 500n * E + SIGNER_GAS_BUFFER });
    expect((await planPayment(conn, 2000n * E)).mode).toBe("consolidate");
});

test("primary key with no gas can't pay from the account", async () => {
    chain({ account: 3000n * E, signer: 0n });
    const p = await planPayment(conn, 2000n * E);
    expect(p.mode).toBe("short");
    expect(p.gasKeyEmpty).toBe(true);
});

test("browser wallet has a single account", async () => {
    chain({ account: 10n * E, signer: 0n });
    expect((await planPayment({ type: "injected", address: ACCOUNT }, 2000n * E)).mode).toBe("short");
});
