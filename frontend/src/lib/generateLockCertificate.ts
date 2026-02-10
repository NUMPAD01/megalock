import { formatTokenAmount, shortenAddress, formatDateTime, getLockTypeLabel } from "@/lib/utils";

interface CertificateData {
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  lockedAmount: bigint;
  totalSupply: bigint;
  decimals: number;
  lockType: number;
  startTime: number;
  endTime: number;
  creator: string;
  beneficiary: string;
  lockId: number;
}

export async function generateLockCertificate(data: CertificateData): Promise<Blob> {
  const W = 600;
  const H = 340;
  const canvas = document.createElement("canvas");
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = "#18181c";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = "#2e2e34";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 16);
  ctx.stroke();

  // Accent bar at top
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#2dd4a8");
  grad.addColorStop(1, "#20c49a");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, 4, [16, 16, 0, 0]);
  ctx.fill();

  // Header
  ctx.fillStyle = "#2dd4a8";
  ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
  ctx.fillText("MEGASCAN LOCK CERTIFICATE", 24, 36);

  // Lock ID badge
  ctx.fillStyle = "rgba(45, 212, 168, 0.1)";
  const idText = `#${data.lockId}`;
  ctx.font = "600 12px system-ui, -apple-system, sans-serif";
  const idWidth = ctx.measureText(idText).width + 16;
  ctx.beginPath();
  ctx.roundRect(W - 24 - idWidth, 22, idWidth, 22, 6);
  ctx.fill();
  ctx.fillStyle = "#2dd4a8";
  ctx.fillText(idText, W - 24 - idWidth + 8, 37);

  // Token name
  ctx.fillStyle = "#d4d4d8";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${data.tokenName} (${data.tokenSymbol})`, 24, 72);

  // Lock type badge
  const typeLabel = getLockTypeLabel(data.lockType);
  ctx.font = "600 11px system-ui, -apple-system, sans-serif";
  const typeWidth = ctx.measureText(typeLabel).width + 16;
  ctx.fillStyle = "rgba(45, 212, 168, 0.1)";
  ctx.beginPath();
  ctx.roundRect(24, 84, typeWidth, 22, 6);
  ctx.fill();
  ctx.fillStyle = "#2dd4a8";
  ctx.fillText(typeLabel, 32, 99);

  // Divider
  ctx.strokeStyle = "#2e2e34";
  ctx.beginPath();
  ctx.moveTo(24, 118);
  ctx.lineTo(W - 24, 118);
  ctx.stroke();

  // Info grid
  const gridY = 136;
  const col1 = 24;
  const col2 = W / 2 + 12;

  const drawField = (x: number, y: number, label: string, value: string) => {
    ctx.fillStyle = "#6b6b73";
    ctx.font = "500 10px system-ui, -apple-system, sans-serif";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "#d4d4d8";
    ctx.font = "600 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(value, x, y + 17);
  };

  const lockedStr = formatTokenAmount(data.lockedAmount, data.decimals) + " " + data.tokenSymbol;
  const supplyPct = data.totalSupply > 0n
    ? (Number((data.lockedAmount * 10000n) / data.totalSupply) / 100).toFixed(2) + "% of supply"
    : "N/A";

  drawField(col1, gridY, "Locked Amount", lockedStr);
  drawField(col2, gridY, "% of Supply", supplyPct);
  drawField(col1, gridY + 50, "Start Date", formatDateTime(data.startTime));
  drawField(col2, gridY + 50, "Unlock Date", formatDateTime(data.endTime));
  drawField(col1, gridY + 100, "Creator", shortenAddress(data.creator));
  drawField(col2, gridY + 100, "Beneficiary", shortenAddress(data.beneficiary));

  // Footer
  ctx.strokeStyle = "#2e2e34";
  ctx.beginPath();
  ctx.moveTo(24, H - 40);
  ctx.lineTo(W - 24, H - 40);
  ctx.stroke();

  ctx.fillStyle = "#6b6b73";
  ctx.font = "500 10px system-ui, -apple-system, sans-serif";
  ctx.fillText("megascan.app", 24, H - 16);
  const addrText = shortenAddress(data.tokenAddress);
  ctx.fillText(addrText, W - 24 - ctx.measureText(addrText).width, H - 16);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}
