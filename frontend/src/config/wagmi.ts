import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, coinbaseWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { megaeth } from "./chains";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [injectedWallet, metaMaskWallet, coinbaseWallet],
    },
  ],
  {
    appName: "MegaLock",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "disabled",
  }
);

export const config = createConfig({
  connectors,
  chains: [megaeth],
  transports: {
    [megaeth.id]: http(),
  },
  ssr: true,
});
