import { NextResponse } from "next/server";
import { generateBlueprint } from "@/lib/data/llmBlueprint";
import type { EDAResult, PromptUnderstanding, EngineeringMeta } from "@/types/data";

export async function POST(request: Request) {
  let body: {
    edaResult: EDAResult;
    promptUnderstanding: PromptUnderstanding;
    engineeredMeta: EngineeringMeta;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { edaResult, promptUnderstanding, engineeredMeta } = body;
  if (!edaResult || !promptUnderstanding || !engineeredMeta) {
    return NextResponse.json(
      { error: "Missing required fields: edaResult, promptUnderstanding, engineeredMeta" },
      { status: 400 }
    );
  }

  try {
    const result = await generateBlueprint(edaResult, promptUnderstanding, engineeredMeta);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/groq/blueprint]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
