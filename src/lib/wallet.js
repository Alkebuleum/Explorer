import { ethers } from "ethers";
import { RPC_URL, CHAIN_ID, CHAIN_NAME, CHAIN_CURRENCY } from "./rpc";

export const hasWallet = () => typeof window !== "undefined" && !!window.ethereum;

// Switches the browser wallet to Alkebuleum, adding the network if needed.
export async function ensureWalletChain() {
  const chainId = "0x" + CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    if (e.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: CHAIN_NAME,
        nativeCurrency: { name: "Alkecoin", symbol: CHAIN_CURRENCY, decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: [window.location.origin],
      }],
    });
  }
}

// Asks the wallet for an account on Alkebuleum; returns the checksummed address.
export async function connectWallet() {
  if (!hasWallet()) throw new Error("No browser wallet found. Install MetaMask or a similar wallet.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureWalletChain();
  return ethers.getAddress(accounts[0]);
}

export async function getSigner() {
  await ensureWalletChain();
  return new ethers.BrowserProvider(window.ethereum).getSigner();
}
