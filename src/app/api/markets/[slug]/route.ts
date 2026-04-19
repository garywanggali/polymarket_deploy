import { NextResponse } from "next/server";

import { readMarketIndex } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const index = await readMarketIndex();
  if (!index) return NextResponse.json({ error: "no_data" }, { status: 404 });

  const market = index.markets.find((m) => m.slug === slug);
  if (!market) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ updatedAt: index.updatedAt, market });
}
