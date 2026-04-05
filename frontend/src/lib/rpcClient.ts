import { createPublicClient, http } from "viem";
import { tempo } from "@/config/chains";

export const rpcClient = createPublicClient({
  chain: tempo,
  transport: http(),
});
