"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseUnits } from "viem";
import { MEGABURN_ADDRESS, MEGABURN_ABI, ERC20_ABI } from "@/lib/contracts";
import { formatTokenAmount } from "@/lib/utils";

export default function BurnPage() {
  const { address, isConnected } = useAccount();
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"approve" | "burn">("approve");

  const { writeContract: approve, data: approveTx, isPending: isApproving } = useWriteContract();
  const { writeContract: burn, data: burnTx, isPending: isBurning } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isBurnConfirming, isSuccess: isBurnConfirmed } = useWaitForTransactionReceipt({ hash: burnTx });

  const { data: totalBurned } = useReadContract({
    address: MEGABURN_ADDRESS, abi: MEGABURN_ABI, functionName: "totalBurned",
    args: token ? [token as `0x${string}`] : undefined,
    query: { enabled: !!token && token.length === 42 },
  });

  const { data: userBurnedAmount } = useReadContract({
    address: MEGABURN_ADDRESS, abi: MEGABURN_ABI, functionName: "userBurned",
    args: address && token ? [address, token as `0x${string}`] : undefined,
    query: { enabled: !!address && !!token && token.length === 42 },
  });

  const handleApprove = () => {
    if (!token || !amount) return;
    approve({ address: token as `0x${string}`, abi: ERC20_ABI, functionName: "approve", args: [MEGABURN_ADDRESS, parseUnits(amount, 18)] });
  };

  const handleBurn = () => {
    if (!token || !amount) return;
    burn({ address: MEGABURN_ADDRESS, abi: MEGABURN_ABI, functionName: "burn", args: [token as `0x${string}`, parseUnits(amount, 18)] });
  };

  useEffect(() => {
    if (isApproveConfirmed && step === "approve") setStep("burn");
  }, [isApproveConfirmed, step]);

  if (!isConnected) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Burn Tokens</h1>
        <p className="text-muted">Connect your wallet to burn tokens</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Burn Tokens</h1>

      <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
        <p className="text-muted text-sm">Permanently burn ERC20 tokens by sending them to the dead address (0x...dEaD). This action is irreversible.</p>

        <div>
          <label className="block text-sm font-medium mb-1">Token Address</label>
          <input type="text" placeholder="0x..." value={token} onChange={(e) => { setToken(e.target.value); setStep("approve"); }} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount to Burn</label>
          <input type="number" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
        </div>

        {token && token.length === 42 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted text-xs">Total Burned (all users)</p>
              <p className="font-semibold text-danger">{totalBurned !== undefined ? formatTokenAmount(totalBurned) : "0"}</p>
            </div>
            <div className="bg-background rounded-lg p-3">
              <p className="text-muted text-xs">Your Total Burned</p>
              <p className="font-semibold">{userBurnedAmount !== undefined ? formatTokenAmount(userBurnedAmount) : "0"}</p>
            </div>
          </div>
        )}

        <div className="bg-danger/5 border border-danger/20 rounded-lg p-3">
          <p className="text-danger text-sm font-medium">Warning: Burning is permanent</p>
          <p className="text-muted text-xs mt-1">Burned tokens are sent to 0x000...dEaD and cannot be recovered.</p>
        </div>

        {step === "approve" && !isApproveConfirmed ? (
          <button onClick={handleApprove} disabled={isApproving || isApproveConfirming || !token || !amount} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
            {isApproving || isApproveConfirming ? "Approving..." : "Approve Token"}
          </button>
        ) : (
          <button onClick={handleBurn} disabled={isBurning || isBurnConfirming || !token || !amount} className="w-full bg-danger hover:bg-danger/80 disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
            {isBurning || isBurnConfirming ? "Burning..." : "Burn Tokens"}
          </button>
        )}

        {isBurnConfirmed && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-success text-sm text-center">Tokens burned successfully!</div>
        )}
      </div>
    </div>
  );
}
