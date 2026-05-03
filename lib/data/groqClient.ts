// Client-side proxy — calls Next.js API routes so GROQ_API_KEY stays server-side.
// Never import groqServer.ts or any LLM lib file from this module.

import type {
  ContextPackage,
  DataUnderstanding,
  DataProfile,
  PromptUnderstanding,
  EngineerFeaturesResult,
  EDAResult,
  EngineeringMeta,
  DashboardBlueprint,
} from "@/types/data";
import type { Rows } from "@/lib/store/pipelineStore";

// ---------------------------------------------------------------------------
// Shared HTTP helper
// ---------------------------------------------------------------------------

async function postRoute<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message: string;
    try {
      const err = (await response.json()) as { error?: string };
      message = err.error ?? `HTTP ${response.status}`;
    } catch {
      message = `HTTP ${response.status}`;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Domain functions — identical signatures to their lib/data/llm* equivalents
// so pipeline.ts can import from here without any other changes.
// ---------------------------------------------------------------------------

export async function understandData(
  contextPackage: ContextPackage
): Promise<DataUnderstanding> {
  return postRoute<DataUnderstanding>("/api/groq/understand", { contextPackage });
}

export async function understandPrompt(
  userPrompt: string,
  cleanedProfile: DataProfile
): Promise<PromptUnderstanding> {
  return postRoute<PromptUnderstanding>("/api/groq/prompt", {
    userPrompt,
    cleanedProfile,
  });
}

export async function engineerFeatures(
  promptUnderstanding: PromptUnderstanding,
  cleanedRows: Rows,
  cleanedProfile: DataProfile
): Promise<EngineerFeaturesResult> {
  return postRoute<EngineerFeaturesResult>("/api/groq/engineer", {
    promptUnderstanding,
    cleanedRows,
    cleanedProfile,
  });
}

export async function generateBlueprint(
  edaResult: EDAResult,
  promptUnderstanding: PromptUnderstanding,
  engineeredMeta: EngineeringMeta
): Promise<DashboardBlueprint> {
  return postRoute<DashboardBlueprint>("/api/groq/blueprint", {
    edaResult,
    promptUnderstanding,
    engineeredMeta,
  });
}
