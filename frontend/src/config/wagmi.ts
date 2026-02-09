import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { megaeth } from "./chains";

export const config = getDefaultConfig({
  appName: "MegaLock",
  projectId: "21fef48091f12692cad574a6f7753643",
  chains: [megaeth],
  ssr: true,
});
