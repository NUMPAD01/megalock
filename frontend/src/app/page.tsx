"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { MEGALOCK_ADDRESS, MEGALOCK_ABI } from "@/lib/contracts";

export default function Dashboard() {
  const { address, isConnected } = useAccount();

  const { data: nextLockId } = useReadContract({
    address: MEGALOCK_ADDRESS,
    abi: MEGALOCK_ABI,
    functionName: "nextLockId",
  });

  const { data: creatorLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS,
    abi: MEGALOCK_ABI,
    functionName: "getLocksByCreator",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: beneficiaryLockIds } = useReadContract({
    address: MEGALOCK_ADDRESS,
    abi: MEGALOCK_ABI,
    functionName: "getLocksByBeneficiary",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted mt-2">
          Lock, vest, and burn your ERC20 tokens on MegaETH
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-6">
          <p className="text-muted text-sm">Total Locks Created</p>
          <p className="text-2xl font-bold mt-1">
            {nextLockId !== undefined ? nextLockId.toString() : "—"}
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-6">
          <p className="text-muted text-sm">Your Created Locks</p>
          <p className="text-2xl font-bold mt-1">
            {isConnected
              ? creatorLockIds
                ? creatorLockIds.length.toString()
                : "0"
              : "—"}
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-6">
          <p className="text-muted text-sm">Locks You Receive</p>
          <p className="text-2xl font-bold mt-1">
            {isConnected
              ? beneficiaryLockIds
                ? beneficiaryLockIds.length.toString()
                : "0"
              : "—"}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/create"
            className="bg-card border border-card-border rounded-xl p-6 hover:border-primary transition-colors group"
          >
            <div className="text-primary text-2xl mb-2">&#128274;</div>
            <h3 className="font-semibold group-hover:text-primary transition-colors">
              Create Lock
            </h3>
            <p className="text-muted text-sm mt-1">
              Lock tokens with timelock, linear, or stepped vesting
            </p>
          </Link>

          <Link
            href="/locks"
            className="bg-card border border-card-border rounded-xl p-6 hover:border-primary transition-colors group"
          >
            <div className="text-accent text-2xl mb-2">&#128188;</div>
            <h3 className="font-semibold group-hover:text-primary transition-colors">
              My Locks
            </h3>
            <p className="text-muted text-sm mt-1">
              View and claim your vested tokens
            </p>
          </Link>

          <Link
            href="/burn"
            className="bg-card border border-card-border rounded-xl p-6 hover:border-primary transition-colors group"
          >
            <div className="text-danger text-2xl mb-2">&#128293;</div>
            <h3 className="font-semibold group-hover:text-primary transition-colors">
              Burn Tokens
            </h3>
            <p className="text-muted text-sm mt-1">
              Permanently burn ERC20 tokens
            </p>
          </Link>
        </div>
      </div>

      {!isConnected && (
        <div className="bg-card border border-card-border rounded-xl p-8 text-center">
          <p className="text-muted">
            Connect your wallet to see your locks and interact with MegaLock
          </p>
        </div>
      )}
    </div>
  );
}
