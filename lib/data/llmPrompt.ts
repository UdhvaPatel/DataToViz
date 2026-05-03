import { callGroq } from "@/lib/data/groqServer";
import type { DataProfile, PromptUnderstanding, PromptIntent } from "@/types/data";

// ---------------------------------------------------------------------------
// Valid intents
// ---------------------------------------------------------------------------

const VALID_INTENTS: ReadonlySet<PromptIntent> = new Set([
  "predict",
  "compare",
  "track",
  "explore",
  "diagnose",
]);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert data analyst helping a user understand what
they want to do with their dataset.

You will receive:
  1. A user's natural-language question or instruction about their data.
  2. A concise schema of the cleaned dataset (column names, types, sample values).

Return a single JSON object — nothing else, no markdown, no explanation:
{
  "intent": "<one of: predict | compare | track | explore | diagnose>",
  "entities": ["<column name or concept>"],
  "target": "<the core question the user wants answered, as a clear sentence>",
  "isVague": <true | false>,
  "clarifyingQuestions": ["<question>"]
}

Intent definitions (choose exactly one):
  predict   — user wants to forecast, estimate, or identify what drives an outcome
  compare   — user wants to compare groups, segments, categories, or cohorts
  track     — user wants to see how a metric changes over time or an ordered sequence
  explore   — user wants a broad overview, pattern discovery, or distribution analysis
  diagnose  — user wants to find root causes, explain anomalies, or understand why

Entity rules:
  - Prefer exact column names from the dataset schema when the user's concept maps clearly.
  - Include implied columns (e.g. "revenue" maps to a column named "amount").
  - Include at most 6 entities; omit identifiers and columns irrelevant to the question.
  - Entities drive which columns end up in the visualization, so be specific.

Vagueness rules — set isVague to true when ANY of these hold:
  - The prompt is fewer than 4 meaningful words with no clear subject.
  - The prompt references concepts that do not correspond to any column.
  - The intent is genuinely ambiguous and multiple interpretations are equally likely.
  - The prompt is purely generic ("show me something", "analyze this").

When isVague is true:
  - Provide exactly 1–2 clarifying questions.
  - Each question must be DATA-SPECIFIC: reference actual column names or values.
  - Do NOT ask generic questions like "what do you want to see?"

When isVague is false:
  - clarifyingQuestions must be an empty array [].

Return ONLY the JSON object.`;

// ---------------------------------------------------------------------------
// Profile snippet — concise schema fed to the LLM alongside the user prompt.
// Richer than a plain column list but much shorter than the full profiler text.
// ---------------------------------------------------------------------------

function buildProfileSnippet(profile: DataProfile): string {
  const lines: string[] = [
    `Dataset type: ${profile.datasetType}`,
    `Rows: ${profile.rowCount.toLocaleString()}`,
    "Columns:",
  ];

  for (const col of profile.columns) {
    let detail = "";

    if (col.dtype === "numeric" && col.numericStats) {
      const { min, max, mean } = col.numericStats;
      detail = ` — range [${min.toFixed(1)}, ${max.toFixed(1)}], mean ${mean.toFixed(1)}`;
    } else if (
      (col.dtype === "categorical" || col.dtype === "boolean") &&
      col.topValues?.length
    ) {
      const sample = col.topValues
        .slice(0, 3)
        .map((tv) => tv.value)
        .join(", ");
      detail = ` — ${col.uniqueCount} unique (e.g. ${sample})`;
    }

    const anomalyTag = col.anomalies.length
      ? ` [${col.anomalies.join(", ")}]`
      : "";

    lines.push(`  "${col.name}" (${col.dtype})${detail}${anomalyTag}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function buildUserMessage(userPrompt: string, profile: DataProfile): string {
  return [
    "=== USER QUESTION ===",
    userPrompt.trim(),
    "",
    "=== DATASET SCHEMA ===",
    buildProfileSnippet(profile),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Response validation and normalisation
// ---------------------------------------------------------------------------

function normaliseIntent(raw: unknown): PromptIntent {
  return VALID_INTENTS.has(raw as PromptIntent)
    ? (raw as PromptIntent)
    : "explore";
}

function normaliseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
}

function asNonEmptyString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

function normaliseResponse(
  raw: unknown,
  userPrompt: string
): PromptUnderstanding {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Expected a JSON object, got: ${JSON.stringify(raw).slice(0, 120)}`
    );
  }

  const r = raw as Record<string, unknown>;

  const intent = normaliseIntent(r.intent);
  const entities = normaliseStringArray(r.entities);
  const target = asNonEmptyString(r.target, userPrompt);

  // Coerce isVague to boolean; default false so the pipeline doesn't stall
  // unnecessarily when the LLM returns a non-boolean.
  const isVague = r.isVague === true;

  const rawQuestions = normaliseStringArray(r.clarifyingQuestions);

  // Enforce invariant: questions are only present when isVague is true.
  // If the LLM returns questions alongside isVague:false, drop them.
  // If isVague:true but no questions, inject a safe default.
  let clarifyingQuestions: string[];
  if (!isVague) {
    clarifyingQuestions = [];
  } else if (rawQuestions.length > 0) {
    clarifyingQuestions = rawQuestions.slice(0, 2); // cap at 2
  } else {
    clarifyingQuestions = [
      "Could you describe the specific metric or outcome you want to analyse?",
    ];
  }

  return { intent, entities, target, isVague, clarifyingQuestions };
}

// ---------------------------------------------------------------------------
// Fallback — produced from local data when the LLM call fails entirely
// ---------------------------------------------------------------------------

function buildFallback(
  userPrompt: string,
  profile: DataProfile
): PromptUnderstanding {
  // Pull up to 4 non-identifier columns as default entities so downstream
  // stages have something to work with even without LLM guidance.
  const safeEntities = profile.columns
    .filter(
      (c) =>
        !c.anomalies.includes("high cardinality") &&
        c.nullPercentage < 80
    )
    .slice(0, 4)
    .map((c) => c.name);

  return {
    intent: "explore",
    entities: safeEntities,
    target: userPrompt.trim() || "Explore the dataset",
    isVague: true,
    clarifyingQuestions: [
      "What specific aspect of the data would you like to focus on?",
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function understandPrompt(
  userPrompt: string,
  cleanedProfile: DataProfile
): Promise<PromptUnderstanding> {
  if (!userPrompt?.trim()) {
    return buildFallback("", cleanedProfile);
  }

  let raw: unknown;
  try {
    raw = await callGroq(SYSTEM_PROMPT, buildUserMessage(userPrompt, cleanedProfile));
  } catch (err) {
    console.error("[understandPrompt] Groq call failed:", err);
    return buildFallback(userPrompt, cleanedProfile);
  }

  try {
    return normaliseResponse(raw, userPrompt);
  } catch (err) {
    console.error("[understandPrompt] Response normalisation failed:", err);
    return buildFallback(userPrompt, cleanedProfile);
  }
}
