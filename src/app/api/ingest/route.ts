import { NextResponse } from "next/server";

import { ingestGammaEvents } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST() {
  try {
    const summary = await ingestGammaEvents();
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "ingest_failed";
    return NextResponse.json({ error: "ingest_failed", message }, { status: 500 });
  }
}
