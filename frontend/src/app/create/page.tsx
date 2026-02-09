"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI, ERC20_ABI } from "@/lib/contracts";
import { dateInputValueToTimestamp } from "@/lib/utils";

type LockTab = "timelock" | "linear" | "stepped";

export default function CreateLockPage() {
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<LockTab>("timelock");

  if (!isConnected) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Create Lock</h1>
        <p className="text-muted">Connect your wallet to create a lock</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Create Lock</h1>

      {/* Tabs */}
      <div className="flex bg-card border border-card-border rounded-xl p-1">
        {(["timelock", "linear", "stepped"] as LockTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-primary text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab === "timelock"
              ? "Timelock"
              : tab === "linear"
              ? "Linear Vesting"
              : "Stepped Vesting"}
          </button>
        ))}
      </div>

      {activeTab === "timelock" && <TimelockForm />}
      {activeTab === "linear" && <LinearVestingForm />}
      {activeTab === "stepped" && <SteppedVestingForm />}
    </div>
  );
}

function TimelockForm() {
  const [token, setToken] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [cancelable, setCancelable] = useState(false);
  const [step, setStep] = useState<"approve" | "create">("approve");

  const { writeContract: approve, data: approveTx, isPending: isApproving } = useWriteContract();
  const { writeContract: createLock, data: createTx, isPending: isCreating } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isCreateConfirming, isSuccess: isCreateConfirmed } = useWaitForTransactionReceipt({ hash: createTx });

  const handleApprove = () => {
    if (!token || !amount) return;
    approve({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [MEGALOCK_ADDRESS, parseUnits(amount, 18)],
    });
  };

  const handleCreate = () => {
    if (!token || !beneficiary || !amount || !unlockDate) return;
    createLock({
      address: MEGALOCK_ADDRESS,
      abi: MEGALOCK_ABI,
      functionName: "createTimeLock",
      args: [
        token as `0x${string}`,
        beneficiary as `0x${string}`,
        parseUnits(amount, 18),
        BigInt(dateInputValueToTimestamp(unlockDate)),
        cancelable,
      ],
    });
  };

  if (isApproveConfirmed && step === "approve") {
    setStep("create");
  }

  return (
    <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
      <p className="text-muted text-sm">
        Lock tokens until a specific date. 100% unlock at the end.
      </p>

      <div>
        <label className="block text-sm font-medium mb-1">Token Address</label>
        <input type="text" placeholder="0x..." value={token} onChange={(e) => setToken(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Beneficiary Address</label>
        <input type="text" placeholder="0x..." value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Amount</label>
        <input type="number" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Unlock Date</label>
        <input type="datetime-local" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="cancelable-tl" checked={cancelable} onChange={(e) => setCancelable(e.target.checked)} className="rounded" />
        <label htmlFor="cancelable-tl" className="text-sm">Cancelable (creator can cancel and recover unvested tokens)</label>
      </div>

      {step === "approve" && !isApproveConfirmed ? (
        <button onClick={handleApprove} disabled={isApproving || isApproveConfirming || !token || !amount} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
          {isApproving || isApproveConfirming ? "Approving..." : "Approve Token"}
        </button>
      ) : (
        <button onClick={handleCreate} disabled={isCreating || isCreateConfirming || !token || !beneficiary || !amount || !unlockDate} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
          {isCreating || isCreateConfirming ? "Creating Lock..." : "Create Timelock"}
        </button>
      )}

      {isCreateConfirmed && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-success text-sm text-center">Lock created successfully!</div>
      )}
    </div>
  );
}

function LinearVestingForm() {
  const [token, setToken] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [cliffDate, setCliffDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cancelable, setCancelable] = useState(false);
  const [step, setStep] = useState<"approve" | "create">("approve");

  const { writeContract: approve, data: approveTx, isPending: isApproving } = useWriteContract();
  const { writeContract: createLock, data: createTx, isPending: isCreating } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isCreateConfirming, isSuccess: isCreateConfirmed } = useWaitForTransactionReceipt({ hash: createTx });

  const handleApprove = () => {
    if (!token || !amount) return;
    approve({ address: token as `0x${string}`, abi: ERC20_ABI, functionName: "approve", args: [MEGALOCK_ADDRESS, parseUnits(amount, 18)] });
  };

  const handleCreate = () => {
    if (!token || !beneficiary || !amount || !startDate || !endDate) return;
    createLock({
      address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "createLinearVesting",
      args: [
        token as `0x${string}`, beneficiary as `0x${string}`, parseUnits(amount, 18),
        BigInt(dateInputValueToTimestamp(startDate)),
        cliffDate ? BigInt(dateInputValueToTimestamp(cliffDate)) : 0n,
        BigInt(dateInputValueToTimestamp(endDate)),
        cancelable,
      ],
    });
  };

  if (isApproveConfirmed && step === "approve") setStep("create");

  return (
    <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
      <p className="text-muted text-sm">Linear token release with optional cliff period. Tokens vest progressively from start to end.</p>

      <div>
        <label className="block text-sm font-medium mb-1">Token Address</label>
        <input type="text" placeholder="0x..." value={token} onChange={(e) => setToken(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Beneficiary Address</label>
        <input type="text" placeholder="0x..." value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Amount</label>
        <input type="number" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Start Date</label>
          <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Cliff Date (optional)</label>
          <input type="datetime-local" value={cliffDate} onChange={(e) => setCliffDate(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">End Date</label>
          <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="cancelable-lv" checked={cancelable} onChange={(e) => setCancelable(e.target.checked)} className="rounded" />
        <label htmlFor="cancelable-lv" className="text-sm">Cancelable</label>
      </div>

      {step === "approve" && !isApproveConfirmed ? (
        <button onClick={handleApprove} disabled={isApproving || isApproveConfirming || !token || !amount} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
          {isApproving || isApproveConfirming ? "Approving..." : "Approve Token"}
        </button>
      ) : (
        <button onClick={handleCreate} disabled={isCreating || isCreateConfirming || !token || !beneficiary || !amount || !startDate || !endDate} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
          {isCreating || isCreateConfirming ? "Creating..." : "Create Linear Vesting"}
        </button>
      )}

      {isCreateConfirmed && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-success text-sm text-center">Linear vesting lock created successfully!</div>
      )}
    </div>
  );
}

function SteppedVestingForm() {
  const [token, setToken] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [cancelable, setCancelable] = useState(false);
  const [milestones, setMilestones] = useState([{ date: "", percentage: "" }]);
  const [step, setStep] = useState<"approve" | "create">("approve");

  const { writeContract: approve, data: approveTx, isPending: isApproving } = useWriteContract();
  const { writeContract: createLock, data: createTx, isPending: isCreating } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isCreateConfirming, isSuccess: isCreateConfirmed } = useWaitForTransactionReceipt({ hash: createTx });

  const totalPercentage = milestones.reduce((sum, m) => sum + (parseFloat(m.percentage) || 0), 0);

  const addMilestone = () => setMilestones([...milestones, { date: "", percentage: "" }]);
  const removeMilestone = (index: number) => setMilestones(milestones.filter((_, i) => i !== index));
  const updateMilestone = (index: number, field: "date" | "percentage", value: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const handleApprove = () => {
    if (!token || !amount) return;
    approve({ address: token as `0x${string}`, abi: ERC20_ABI, functionName: "approve", args: [MEGALOCK_ADDRESS, parseUnits(amount, 18)] });
  };

  const handleCreate = () => {
    if (!token || !beneficiary || !amount || totalPercentage !== 100) return;
    const milestonesArgs = milestones.map((m) => ({
      timestamp: BigInt(dateInputValueToTimestamp(m.date)),
      basisPoints: BigInt(Math.round(parseFloat(m.percentage) * 100)),
    }));
    createLock({
      address: MEGALOCK_ADDRESS, abi: MEGALOCK_ABI, functionName: "createSteppedVesting",
      args: [token as `0x${string}`, beneficiary as `0x${string}`, parseUnits(amount, 18), milestonesArgs, cancelable],
    });
  };

  if (isApproveConfirmed && step === "approve") setStep("create");

  return (
    <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
      <p className="text-muted text-sm">Define milestones with specific dates and percentages. Tokens unlock at each milestone.</p>

      <div>
        <label className="block text-sm font-medium mb-1">Token Address</label>
        <input type="text" placeholder="0x..." value={token} onChange={(e) => setToken(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Beneficiary Address</label>
        <input type="text" placeholder="0x..." value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Total Amount</label>
        <input type="number" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Milestones</label>
          <span className={`text-sm ${totalPercentage === 100 ? "text-success" : "text-danger"}`}>
            Total: {totalPercentage}% / 100%
          </span>
        </div>
        <div className="space-y-2">
          {milestones.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input type="datetime-local" value={m.date} onChange={(e) => updateMilestone(i, "date", e.target.value)} className="flex-1 bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              <div className="relative w-24">
                <input type="number" placeholder="%" value={m.percentage} onChange={(e) => updateMilestone(i, "percentage", e.target.value)} className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary pr-6" />
                <span className="absolute right-3 top-2 text-muted text-sm">%</span>
              </div>
              {milestones.length > 1 && (
                <button onClick={() => removeMilestone(i)} className="text-danger hover:text-danger/80 text-sm px-2">X</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={addMilestone} className="mt-2 text-primary hover:text-primary-hover text-sm font-medium">+ Add Milestone</button>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="cancelable-sv" checked={cancelable} onChange={(e) => setCancelable(e.target.checked)} className="rounded" />
        <label htmlFor="cancelable-sv" className="text-sm">Cancelable</label>
      </div>

      {step === "approve" && !isApproveConfirmed ? (
        <button onClick={handleApprove} disabled={isApproving || isApproveConfirming || !token || !amount} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
          {isApproving || isApproveConfirming ? "Approving..." : "Approve Token"}
        </button>
      ) : (
        <button onClick={handleCreate} disabled={isCreating || isCreateConfirming || !token || !beneficiary || !amount || totalPercentage !== 100} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-medium py-3 px-4 rounded-lg transition-colors">
          {isCreating || isCreateConfirming ? "Creating..." : "Create Stepped Vesting"}
        </button>
      )}

      {isCreateConfirmed && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-success text-sm text-center">Stepped vesting lock created successfully!</div>
      )}
    </div>
  );
}
