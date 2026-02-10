import { createPublicClient, http } from "viem";
import { megaeth } from "@/config/chains";

export const rpcClient = createPublicClient({
  chain: megaeth,
  transport: http(),
});
