import { defineChain } from "viem";

export const megaeth = defineChain({
  id: 4326,
  name: "MegaETH",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.megaeth.com/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "MegaETH Explorer",
      url: "https://megaeth.blockscout.com",
    },
  },
});
