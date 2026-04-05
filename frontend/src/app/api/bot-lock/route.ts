import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

// Use globalThis to persist across warm invocations
const getStore = (): Set<string> => {
  const g = globalThis as unknown as { _botSentCAs?: Set<string> };
  if (!g._botSentCAs) g._botSentCAs = new Set<string>();
  return g._botSentCAs;
};

export async function POST(request: Request) {
  try {
    const { ca, secret } = await request.json();
    if (secret !== "temposcan_bot_2026") {
      return NextResponse.json({ send: false }, { status: 401 });
    }
    if (!ca) return NextResponse.json({ send: false });

    const store = getStore();
    const key = ca.toLowerCase();

    if (store.has(key)) {
      return NextResponse.json({ send: false });
    }

    store.add(key);
    return NextResponse.json({ send: true });
  } catch {
    return NextResponse.json({ send: false });
  }
}

export async function GET() {
  return NextResponse.json({ size: getStore().size });
}
