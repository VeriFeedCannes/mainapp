import { createPublicClient, http, type Chain } from "viem";
import { worldchain, sepolia } from "viem/chains";

const CHAIN_MAP: Record<string, Chain> = {
  worldchain,
  sepolia,
};

const chainKey = process.env.ARX_CHAIN ?? "worldchain";
export const arxChain: Chain = CHAIN_MAP[chainKey] ?? worldchain;
export const arxRpc: string =
  process.env.ARX_CHAIN_RPC ?? "https://worldchain-mainnet.g.alchemy.com/public";

export function getArxClient() {
  return createPublicClient({
    chain: arxChain,
    transport: http(arxRpc),
  });
}
