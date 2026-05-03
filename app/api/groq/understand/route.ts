import { NextResponse } from "next/server";
import { understandData } from "@/lib/data/llmUnderstand";
import type { ContextPackage } from "@/types/data";

export async function POST(request: Request) {
  let body: { contextPackage: ContextPackage };
  try {
    body = (await request.json()) as { contextPackage: ContextPackage };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contextPackage } = body;
  if (!contextPackage) {
    return NextResponse.json({ error: "Missing contextPackage" }, { status: 400 });
  }

  try {
    const result = await understandData(contextPackage);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/groq/understand]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
