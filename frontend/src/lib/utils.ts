import { formatUnits } from "viem";

export function formatTokenAmount(amount: bigint, decimals: number = 18): string {
  const formatted = formatUnits(amount, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.001) return "< 0.001";
  if (num < 1) return num.toFixed(4);
  if (num < 1000) return num.toFixed(2);
  if (num < 1_000_000) return (num / 1000).toFixed(2) + "K";
  return (num / 1_000_000).toFixed(2) + "M";
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timestampToDateInputValue(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().slice(0, 16);
}

export function dateInputValueToTimestamp(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function getLockTypeLabel(lockType: number): string {
  switch (lockType) {
    case 0:
      return "Timelock";
    case 1:
      return "Linear Vesting";
    case 2:
      return "Stepped Vesting";
    default:
      return "Unknown";
  }
}

export function getVestingProgress(
  claimedAmount: bigint,
  totalAmount: bigint
): number {
  if (totalAmount === 0n) return 0;
  return Number((claimedAmount * 10000n) / totalAmount) / 100;
}
