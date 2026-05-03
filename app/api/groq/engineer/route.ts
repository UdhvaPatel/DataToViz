import { NextResponse } from "next/server";
import { engineerFeatures } from "@/lib/data/llmEngineer";
import type { PromptUnderstanding, DataProfile } from "@/types/data";

export async function POST(request: Request) {
  let body: {
    promptUnderstanding: PromptUnderstanding;
    cleanedRows: Record<string, unknown>[];
    cleanedProfile: DataProfile;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { promptUnderstanding, cleanedRows, cleanedProfile } = body;
  if (!promptUnderstanding || !cleanedRows || !cleanedProfile) {
    return NextResponse.json(
      { error: "Missing required fields: promptUnderstanding, cleanedRows, cleanedProfile" },
      { status: 400 }
    );
  }

  try {
    const result = await engineerFeatures(promptUnderstanding, cleanedRows, cleanedProfile);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/groq/engineer]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
