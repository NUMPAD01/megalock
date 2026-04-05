import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  if (!address) return NextResponse.json({ balances: [] }, { status: 400 });

  try {
    const res = await fetch(
      `https://explore.mainnet.tempo.xyz/api/address/balances/${address}`,
      { headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) return NextResponse.json({ balances: [] });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ balances: [] });
  }
}
