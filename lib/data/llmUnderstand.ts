import { callGroq } from "@/lib/data/groqServer";
import type {
  ContextPackage,
  DataUnderstanding,
  ColumnRoleAssignment,
  ColumnCleaningStep,
  ColumnRole,
  CleaningAction,
} from "@/types/data";

// ---------------------------------------------------------------------------
// Valid enum members — used both for validation and prompt documentation
// ---------------------------------------------------------------------------

const VALID_ROLES: ReadonlySet<ColumnRole> = new Set([
  "target",
  "feature",
  "identifier",
  "irrelevant",
]);

const VALID_ACTIONS: ReadonlySet<CleaningAction> = new Set([
  "drop",
  "impute_mean",
  "impute_median",
  "impute_mode",
  "impute_placeholder",
  "cap_outliers",
  "keep",
]);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert data analyst. You will be given a statistical
profile of a dataset together with a small sample of its rows.

Your job is to return a single JSON object — nothing else, no explanation — that
describes the dataset and recommends how to prepare each column for analysis.

The JSON must match this exact schema:
{
  "datasetType": "<concise label for what kind of dataset this is>",
  "columnRoles": [
    {
      "columnName": "<exact column name as it appears in the data>",
      "semanticMeaning": "<what this column represents in the real world>",
      "role": "<one of: target | feature | identifier | irrelevant>",
      "suggestedAction": "<specific recommendation for using this column in analysis>"
    }
  ],
  "cleaningPlan": [
    {
      "columnName": "<exact column name>",
      "action": "<one of: drop | impute_mean | impute_median | impute_mode | impute_placeholder | cap_outliers | keep>",
      "reason": "<why this action is the best choice for this column>"
    }
  ]
}

Role definitions:
  target       — the primary variable being predicted, measured, or analysed
  feature      — an input variable that supports analysis or modelling
  identifier   — a unique key or ID; not useful for analysis itself
  irrelevant   — should be dropped (free-text notes, internal codes, etc.)

Cleaning action definitions:
  drop                — remove the column entirely (high null %, irrelevant, duplicate)
  impute_mean         — fill nulls with the column mean (numeric, symmetric distribution)
  impute_median       — fill nulls with the column median (numeric, skewed or with outliers)
  impute_mode         — fill nulls with the most frequent value (categorical or boolean)
  impute_placeholder  — fill nulls with a literal "Unknown" / "N/A" string (categorical)
  cap_outliers        — winsorise at 1st / 99th percentile (numeric with extreme outliers)
  keep                — use as-is, no cleaning required

Rules:
  - Every column that appears in the profile MUST appear in both columnRoles and cleaningPlan.
  - Use only the exact column names from the profile — do not invent names.
  - Return ONLY the JSON object. Do not add markdown fences or commentary.`;

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function buildUserMessage(pkg: ContextPackage): string {
  const parts: string[] = [];

  parts.push("=== DATASET PROFILE ===");
  parts.push(pkg.profileSummary);

  if (pkg.anomalyFlags.length > 0) {
    parts.push("\n=== ANOMALIES DETECTED ===");
    pkg.anomalyFlags.forEach((f) => parts.push(`  • ${f}`));
  }

  // Cap at 10 rows to stay well within the 8 192-token context window.
  // Compact (no whitespace) serialisation saves tokens without losing content.
  const sampleRows = pkg.sampledRows.slice(0, 10);
  if (sampleRows.length > 0) {
    parts.push("\n=== SAMPLE ROWS (compact JSON) ===");
    parts.push(JSON.stringify(sampleRows));
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Response validation + normalisation
//
// Strategy: be lenient — fix what can be fixed, fill gaps, reject only if the
// top-level shape is completely unrecoverable.  This ensures the pipeline
// always advances even when the LLM drifts from the schema.
// ---------------------------------------------------------------------------

function validateRole(raw: unknown): ColumnRole {
  return VALID_ROLES.has(raw as ColumnRole) ? (raw as ColumnRole) : "feature";
}

function validateAction(raw: unknown): CleaningAction {
  return VALID_ACTIONS.has(raw as CleaningAction)
    ? (raw as CleaningAction)
    : "keep";
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

function parseColumnRoles(raw: unknown): ColumnRoleAssignment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
    )
    .map((item) => ({
      columnName: asString(item.columnName, ""),
      semanticMeaning: asString(item.semanticMeaning, "Unknown"),
      role: validateRole(item.role),
      suggestedAction: asString(item.suggestedAction, "Review manually"),
    }))
    .filter((item) => item.columnName !== "");
}

function parseCleaningPlan(raw: unknown): ColumnCleaningStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
    )
    .map((item) => ({
      columnName: asString(item.columnName, ""),
      action: validateAction(item.action),
      reason: asString(item.reason, "No reason provided"),
    }))
    .filter((item) => item.columnName !== "");
}

/**
 * Parses and normalises the raw Groq response into a DataUnderstanding.
 * Throws only if the response is not an object at all — any other deviation
 * is patched rather than rejected.
 */
function normaliseResponse(
  raw: unknown,
  allColumns: string[]
): DataUnderstanding {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Expected a JSON object but received: ${JSON.stringify(raw).slice(0, 120)}`
    );
  }

  const r = raw as Record<string, unknown>;

  const datasetType = asString(r.datasetType, "unknown");
  const columnRoles = parseColumnRoles(r.columnRoles);
  const cleaningPlan = parseCleaningPlan(r.cleaningPlan);

  // Guarantee every known column is represented — LLMs occasionally omit
  // columns when there are many of them.
  const coveredRoles = new Set(columnRoles.map((cr) => cr.columnName));
  const coveredPlan = new Set(cleaningPlan.map((cp) => cp.columnName));

  for (const col of allColumns) {
    if (!coveredRoles.has(col)) {
      columnRoles.push({
        columnName: col,
        semanticMeaning: "Not assessed",
        role: "feature",
        suggestedAction: "Review manually",
      });
    }
    if (!coveredPlan.has(col)) {
      cleaningPlan.push({
        columnName: col,
        action: "keep",
        reason: "Not assessed by LLM — defaulting to keep",
      });
    }
  }

  return { datasetType, columnRoles, cleaningPlan };
}

// ---------------------------------------------------------------------------
// Fallback — produced entirely from local data when the LLM call fails
// ---------------------------------------------------------------------------

function buildFallback(
  pkg: ContextPackage,
  allColumns: string[]
): DataUnderstanding {
  return {
    datasetType: pkg.datasetType,
    columnRoles: allColumns.map((col) => ({
      columnName: col,
      semanticMeaning: "Undetermined — LLM analysis unavailable",
      role: "feature",
      suggestedAction: "Review manually before analysis",
    })),
    cleaningPlan: allColumns.map((col) => ({
      columnName: col,
      action: "keep",
      reason: "Default — LLM analysis unavailable",
    })),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function understandData(
  contextPackage: ContextPackage
): Promise<DataUnderstanding> {
  // Derive authoritative column list from the first sampled row.
  // The sampler always preserves the original column order.
  const allColumns =
    contextPackage.sampledRows.length > 0
      ? Object.keys(contextPackage.sampledRows[0])
      : [];

  let raw: unknown;
  try {
    raw = await callGroq(SYSTEM_PROMPT, buildUserMessage(contextPackage));
  } catch (err) {
    // LLM call failed entirely — return a safe local fallback so the pipeline
    // can still progress with default assignments.
    console.error("[understandData] Groq call failed:", err);
    return buildFallback(contextPackage, allColumns);
  }

  try {
    return normaliseResponse(raw, allColumns);
  } catch (err) {
    // The call succeeded but the shape is unrecoverable — same fallback.
    console.error("[understandData] Response normalisation failed:", err);
    return buildFallback(contextPackage, allColumns);
  }
}
