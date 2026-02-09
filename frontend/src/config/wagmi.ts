import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { megaeth } from "./chains";

export const config = getDefaultConfig({
  appName: "MegaLock",
  projectId: "YOUR_WALLETCONNECT_PROJECT_ID", // Get one at https://cloud.walletconnect.com
  chains: [megaeth],
  ssr: true,
});
