import { NextResponse } from "next/server";
import { understandPrompt } from "@/lib/data/llmPrompt";
import type { DataProfile } from "@/types/data";

export async function POST(request: Request) {
  let body: { userPrompt: string; cleanedProfile: DataProfile };
  try {
    body = (await request.json()) as { userPrompt: string; cleanedProfile: DataProfile };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userPrompt, cleanedProfile } = body;
  if (!cleanedProfile) {
    return NextResponse.json({ error: "Missing cleanedProfile" }, { status: 400 });
  }

  try {
    const result = await understandPrompt(userPrompt ?? "", cleanedProfile);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/groq/prompt]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
