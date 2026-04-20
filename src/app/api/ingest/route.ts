import { NextResponse } from "next/server";

import { ingestGammaEvents } from "@/lib/ingest";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return true;
  const header = req.headers.get("x-ingest-token");
  return header === token;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await ingestGammaEvents();
  return NextResponse.json(summary);
}
