import { defineChain } from "viem";

export const tempo = defineChain({
  id: 4217,
  name: "Tempo",
  nativeCurrency: {
    name: "USD",
    symbol: "USD",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.tempo.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Tempo Explorer",
      url: "https://explore.mainnet.tempo.xyz",
    },
  },
});
