import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { tempo } from "./chains";

export const config = getDefaultConfig({
  appName: "TempoLock",
  projectId: "21fef48091f12692cad574a6f7753643",
  chains: [tempo],
  ssr: true,
});
