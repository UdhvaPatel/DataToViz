import { callGroq } from "@/lib/data/groqServer";
import type {
  PromptUnderstanding,
  DataProfile,
  EngineeredFeature,
  EngineeringTechnique,
  EngineeringMeta,
  EngineerFeaturesResult,
} from "@/types/data";

// ---------------------------------------------------------------------------
// Valid techniques
// ---------------------------------------------------------------------------

const VALID_TECHNIQUES: ReadonlySet<EngineeringTechnique> = new Set([
  "transformation",
  "aggregation",
  "encoding",
  "decomposition",
  "derived_score",
]);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert data scientist preparing a dataset for visualization.

You will receive:
  1. The user's analysis goal, intent, and key entities from their question.
  2. A concise schema of the cleaned dataset.
  3. A small sample of the data rows.

Return a single JSON object — no markdown, no explanation:
{
  "selectedColumns": ["<exact column name from schema>"],
  "engineeredFeatures": [
    {
      "newColumnName": "<snake_case name, must not conflict with existing columns>",
      "technique": "<transformation | aggregation | encoding | decomposition | derived_score>",
      "formula": "<human-readable description of how to compute the column>",
      "reason": "<why this new column helps answer the user's question>",
      "sourceColumns": ["<existing column name used as input>"]
    }
  ]
}

Technique guide and formula examples:
  transformation  — math function on a single numeric column
                    "log(revenue + 1)"  "sqrt(amount)"  "normalize to [0,1]"
                    "standardize to z-score"  "square(value)"  "absolute value"
  aggregation     — per-group summary joined back to every row as a new column
                    sourceColumns[0] = metric, sourceColumns[1] = groupby column
                    "mean revenue by category"  "sum orders per region"  "count events by user_id"
  encoding        — convert categorical/boolean column to a numeric column
                    "frequency encoding"  "label encoding"  "binary: 1 if <value> else 0"
  decomposition   — extract a single component from a datetime column
                    "extract year"  "extract month"  "extract weekday"
                    "extract quarter"  "extract hour"  "is_weekend (1/0)"
  derived_score   — weighted combination of normalised numeric columns
                    "0.5 * col1 + 0.3 * col2 + 0.2 * col3"
                    "equal-weight average of col1, col2, col3"

Selection rules:
  - selectedColumns must only contain column names that appear verbatim in the schema.
  - Include every column that is directly relevant to the user's question.
  - Include source columns for any feature you plan to engineer.
  - Aim for 3–8 total final columns; more than 10 hurts chart readability.

Engineering rules:
  - Produce 0–3 features. Only engineer when it measurably helps the question.
  - sourceColumns must be existing schema column names — never an engineered column name.
  - If no engineering is needed, return engineeredFeatures: [].

Return ONLY the JSON object.`;

// ---------------------------------------------------------------------------
// Utilities (private — mirrors cleaner.ts to avoid coupling internals)
// ---------------------------------------------------------------------------

function toFloat(v: unknown): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const c = v.trim().replace(/^[$£€¥₹]/, "").replace(/,/g, "");
    const n = Number(c);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Safe reduce-based min/max — avoids stack overflow on large spread calls. */
function safeMin(nums: number[]): number {
  return nums.reduce((a, b) => Math.min(a, b), Infinity);
}
function safeMax(nums: number[]): number {
  return nums.reduce((a, b) => Math.max(a, b), -Infinity);
}

// ---------------------------------------------------------------------------
// Feature engineering executors
// ---------------------------------------------------------------------------

function applyTransformation(
  rows: Record<string, unknown>[],
  feature: EngineeredFeature
): void {
  const { newColumnName, formula, sourceColumns } = feature;
  const src = sourceColumns[0];
  if (!src) return;

  const f = formula.toLowerCase();

  // Pre-compute column stats for scaling operations (one pass before mutation)
  const nums = rows
    .map((r) => toFloat(r[src]))
    .filter((v): v is number => v !== null);

  const min = safeMin(nums);
  const max = safeMax(nums);
  const mu = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  const variance =
    nums.length > 1
      ? nums.reduce((a, v) => a + (v - mu) ** 2, 0) / nums.length
      : 0;
  const std = Math.sqrt(variance) || 1; // guard against zero std

  for (const row of rows) {
    const v = toFloat(row[src]);
    if (v === null) { row[newColumnName] = null; continue; }

    if (f.includes("log")) {
      row[newColumnName] = Math.log1p(Math.max(0, v));          // log(v + 1)
    } else if (f.includes("sqrt")) {
      row[newColumnName] = Math.sqrt(Math.abs(v));
    } else if (f.includes("normaliz") || f.includes("min-max") || f.includes("min_max")) {
      row[newColumnName] = max > min ? (v - min) / (max - min) : 0;
    } else if (f.includes("standardiz") || f.includes("z-score") || f.includes("zscore")) {
      row[newColumnName] = (v - mu) / std;
    } else if (f.includes("square") || f.includes("^2") || f.includes("**2")) {
      row[newColumnName] = v ** 2;
    } else if (f.includes("abs")) {
      row[newColumnName] = Math.abs(v);
    } else if (f.includes("invert") || f.includes("1/") || f.includes("recip")) {
      row[newColumnName] = v !== 0 ? 1 / v : null;
    } else {
      // Default: log1p (most common transformation for right-skewed data)
      row[newColumnName] = Math.log1p(Math.max(0, v));
    }
  }
}

function applyAggregation(
  rows: Record<string, unknown>[],
  feature: EngineeredFeature
): void {
  const { newColumnName, formula, sourceColumns } = feature;
  const metricCol = sourceColumns[0];
  const groupCol = sourceColumns[1]; // undefined → global aggregate
  if (!metricCol) return;

  const f = formula.toLowerCase();

  function aggregate(nums: number[]): number {
    if (nums.length === 0) return 0;
    if (f.includes("sum")) return nums.reduce((a, b) => a + b, 0);
    if (f.includes("count")) return nums.length;
    if (f.includes("min")) return safeMin(nums);
    if (f.includes("max")) return safeMax(nums);
    // Default: mean
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  if (!groupCol) {
    // Global aggregate: every row gets the same scalar
    const allNums = rows
      .map((r) => toFloat(r[metricCol]))
      .filter((v): v is number => v !== null);
    const agg = aggregate(allNums);
    for (const row of rows) row[newColumnName] = agg;
    return;
  }

  // Build per-group buckets (only from rows with non-null metric values)
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[groupCol] ?? "__null__");
    const v = toFloat(row[metricCol]);
    if (v === null) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(v);
    buckets.set(key, bucket);
  }

  // Compute aggregate per group
  const groupAgg = new Map<string, number>();
  for (const [key, nums] of buckets) groupAgg.set(key, aggregate(nums));

  // Join the group aggregate back to every row in that group
  for (const row of rows) {
    const key = String(row[groupCol] ?? "__null__");
    row[newColumnName] = groupAgg.get(key) ?? null;
  }
}

function applyEncoding(
  rows: Record<string, unknown>[],
  feature: EngineeredFeature
): void {
  const { newColumnName, formula, sourceColumns } = feature;
  const src = sourceColumns[0];
  if (!src) return;

  const f = formula.toLowerCase();

  if (f.includes("freq")) {
    // Frequency encoding: each value → its row count across the dataset
    const freq = new Map<string, number>();
    for (const row of rows) {
      const key = String(row[src] ?? "").trim();
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    for (const row of rows) {
      row[newColumnName] = freq.get(String(row[src] ?? "").trim()) ?? 0;
    }

  } else if (f.includes("binary") || f.includes("1 if") || f.includes("one-hot")) {
    // Binary/one-hot: 1 for a specific class, 0 otherwise
    // Extract the target value from patterns like: "binary: 1 if 'yes'" or "1 if value == 'male'"
    const quoted = formula.match(/["']([^"']+)["']/);
    const equalSign = formula.match(/==\s*['"']?([^'"]+)['"']?/);
    const positive = (quoted?.[1] ?? equalSign?.[1] ?? "").trim().toLowerCase();

    for (const row of rows) {
      const v = String(row[src] ?? "").trim().toLowerCase();
      row[newColumnName] = positive
        ? (v === positive ? 1 : 0)
        : (["true", "yes", "1"].includes(v) ? 1 : 0);
    }

  } else {
    // Default: label encoding — sort unique values, assign integer indices
    const uniques = [
      ...new Set(rows.map((r) => String(r[src] ?? "").trim())),
    ].sort();
    const mapping = new Map(uniques.map((v, i) => [v, i]));
    for (const row of rows) {
      const key = String(row[src] ?? "").trim();
      row[newColumnName] = mapping.get(key) ?? -1;
    }
  }
}

function applyDecomposition(
  rows: Record<string, unknown>[],
  feature: EngineeredFeature
): void {
  const { newColumnName, formula, sourceColumns } = feature;
  const src = sourceColumns[0];
  if (!src) return;

  const f = formula.toLowerCase();

  for (const row of rows) {
    const d = toDate(row[src]);
    if (!d) { row[newColumnName] = null; continue; }

    if (f.includes("year")) {
      row[newColumnName] = d.getFullYear();
    } else if (f.includes("quarter")) {
      row[newColumnName] = Math.floor(d.getMonth() / 3) + 1;
    } else if (f.includes("month")) {
      row[newColumnName] = d.getMonth() + 1;           // 1-based
    } else if (f.includes("week")) {
      // ISO-approximate week number: day-of-year / 7
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86_400_000);
      row[newColumnName] = Math.ceil((dayOfYear + 1) / 7);
    } else if (f.includes("weekend")) {
      const day = d.getDay();
      row[newColumnName] = day === 0 || day === 6 ? 1 : 0;
    } else if (f.includes("weekday") || f.includes("dow") || f.includes("day_of_week")) {
      row[newColumnName] = d.getDay();                  // 0=Sun … 6=Sat
    } else if (f.includes("hour")) {
      row[newColumnName] = d.getHours();
    } else if (f.includes("day")) {
      row[newColumnName] = d.getDate();                 // day of month
    } else {
      row[newColumnName] = d.getMonth() + 1;            // default: month
    }
  }
}

function applyDerivedScore(
  rows: Record<string, unknown>[],
  feature: EngineeredFeature
): void {
  const { newColumnName, formula, sourceColumns } = feature;
  if (sourceColumns.length === 0) return;

  // Parse explicit weights: "0.5 * col_name" or "50% * col_name"
  const weightPattern = /([0-9]*\.?[0-9]+)%?\s*\*\s*([\w]+)/g;
  const parsedWeights = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = weightPattern.exec(formula)) !== null) {
    const w = parseFloat(m[1]);
    parsedWeights.set(m[2], w > 1 ? w / 100 : w); // handle percentages
  }

  // Pre-compute min/max per source column for normalisation
  const colStats = new Map<string, { min: number; max: number }>();
  for (const col of sourceColumns) {
    const nums = rows
      .map((r) => toFloat(r[col]))
      .filter((v): v is number => v !== null);
    if (nums.length === 0) continue;
    colStats.set(col, { min: safeMin(nums), max: safeMax(nums) });
  }

  for (const row of rows) {
    let weightedSum = 0;
    let totalWeight = 0;
    let hasAny = false;

    for (const col of sourceColumns) {
      const v = toFloat(row[col]);
      if (v === null) continue;

      const stats = colStats.get(col);
      const norm =
        stats && stats.max > stats.min
          ? (v - stats.min) / (stats.max - stats.min)
          : v;

      const weight = parsedWeights.get(col) ?? 1;   // equal weight when unspecified
      weightedSum += norm * weight;
      totalWeight += weight;
      hasAny = true;
    }

    row[newColumnName] = hasAny && totalWeight > 0 ? weightedSum / totalWeight : null;
  }
}

// ---------------------------------------------------------------------------
// Dispatch — routes each feature to the right executor
// ---------------------------------------------------------------------------

function applyEngineeredFeature(
  rows: Record<string, unknown>[],
  feature: EngineeredFeature
): void {
  switch (feature.technique) {
    case "transformation":  return applyTransformation(rows, feature);
    case "aggregation":     return applyAggregation(rows, feature);
    case "encoding":        return applyEncoding(rows, feature);
    case "decomposition":   return applyDecomposition(rows, feature);
    case "derived_score":   return applyDerivedScore(rows, feature);
  }
}

// ---------------------------------------------------------------------------
// LLM prompt building
// ---------------------------------------------------------------------------

function buildProfileSnippet(profile: DataProfile): string {
  const lines = [
    `Dataset type: ${profile.datasetType}`,
    `Rows: ${profile.rowCount.toLocaleString()}`,
    "Columns:",
  ];
  for (const col of profile.columns) {
    let detail = "";
    if (col.dtype === "numeric" && col.numericStats) {
      const { min, max } = col.numericStats;
      detail = ` — [${min.toFixed(1)}, ${max.toFixed(1)}]`;
    } else if ((col.dtype === "categorical" || col.dtype === "boolean") && col.topValues?.length) {
      const sample = col.topValues.slice(0, 3).map((tv) => tv.value).join(", ");
      detail = ` — ${col.uniqueCount} unique (e.g. ${sample})`;
    }
    lines.push(`  "${col.name}" (${col.dtype})${detail}`);
  }
  return lines.join("\n");
}

function buildUserMessage(
  pu: PromptUnderstanding,
  cleanedProfile: DataProfile,
  cleanedRows: Record<string, unknown>[]
): string {
  const parts: string[] = [];

  parts.push("=== ANALYSIS GOAL ===");
  parts.push(`Intent: ${pu.intent}`);
  parts.push(`Target: ${pu.target}`);
  if (pu.entities.length > 0) {
    parts.push(`Key entities: ${pu.entities.join(", ")}`);
  }

  parts.push("\n=== DATASET SCHEMA ===");
  parts.push(buildProfileSnippet(cleanedProfile));

  const sample = cleanedRows.slice(0, 6);
  if (sample.length > 0) {
    parts.push("\n=== SAMPLE ROWS ===");
    parts.push(JSON.stringify(sample));
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Response validation and normalisation
// ---------------------------------------------------------------------------

function asStr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

function normaliseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
}

function normaliseFeatures(raw: unknown): EngineeredFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item)
    )
    .map((item): EngineeredFeature | null => {
      const newColumnName = asStr(item.newColumnName, "");
      if (!newColumnName) return null;

      const technique = VALID_TECHNIQUES.has(item.technique as EngineeringTechnique)
        ? (item.technique as EngineeringTechnique)
        : null;
      if (!technique) return null;

      return {
        newColumnName,
        technique,
        formula: asStr(item.formula, ""),
        reason: asStr(item.reason, ""),
        sourceColumns: normaliseStringArray(item.sourceColumns),
      };
    })
    .filter((f): f is EngineeredFeature => f !== null);
}

function normaliseResponse(
  raw: unknown,
  cleanedProfile: DataProfile,
  pu: PromptUnderstanding
): { selectedColumns: string[]; engineeredFeatures: EngineeredFeature[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Expected object, got: ${JSON.stringify(raw).slice(0, 120)}`);
  }

  const r = raw as Record<string, unknown>;
  const knownCols = new Set(cleanedProfile.columns.map((c) => c.name));

  // Filter selectedColumns to only names that actually exist
  const rawSelected = normaliseStringArray(r.selectedColumns).filter((c) =>
    knownCols.has(c)
  );

  // If LLM returned nothing valid, seed from PromptUnderstanding entities
  const selectedColumns =
    rawSelected.length > 0
      ? rawSelected
      : pu.entities.filter((e) => knownCols.has(e));

  // Filter engineered features: sourceColumns must exist in schema
  const engineeredFeatures = normaliseFeatures(r.engineeredFeatures).filter(
    (f) => f.sourceColumns.length > 0 && f.sourceColumns.every((c) => knownCols.has(c))
  );

  // Guarantee that any source column referenced is in selectedColumns
  const selected = new Set(selectedColumns);
  for (const f of engineeredFeatures) {
    for (const src of f.sourceColumns) {
      if (!selected.has(src)) { selected.add(src); }
    }
  }

  return { selectedColumns: [...selected], engineeredFeatures };
}

// ---------------------------------------------------------------------------
// Fallback — when the LLM call fails entirely
// ---------------------------------------------------------------------------

function buildFallback(
  cleanedProfile: DataProfile,
  pu: PromptUnderstanding
): { selectedColumns: string[]; engineeredFeatures: EngineeredFeature[] } {
  const knownCols = new Set(cleanedProfile.columns.map((c) => c.name));

  const selectedColumns =
    pu.entities.filter((e) => knownCols.has(e)).slice(0, 6);

  return {
    selectedColumns:
      selectedColumns.length > 0
        ? selectedColumns
        : cleanedProfile.columns
            .filter((c) => !c.anomalies.includes("high cardinality"))
            .slice(0, 5)
            .map((c) => c.name),
    engineeredFeatures: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function engineerFeatures(
  promptUnderstanding: PromptUnderstanding,
  cleanedRows: Record<string, unknown>[],
  cleanedProfile: DataProfile
): Promise<EngineerFeaturesResult> {
  // --- LLM call ---
  let llmResult: { selectedColumns: string[]; engineeredFeatures: EngineeredFeature[] };

  try {
    const raw = await callGroq(
      SYSTEM_PROMPT,
      buildUserMessage(promptUnderstanding, cleanedProfile, cleanedRows)
    );
    llmResult = normaliseResponse(raw, cleanedProfile, promptUnderstanding);
  } catch (err) {
    console.error("[engineerFeatures] Groq call or normalisation failed:", err);
    llmResult = buildFallback(cleanedProfile, promptUnderstanding);
  }

  const { selectedColumns, engineeredFeatures } = llmResult;

  // --- Execute feature engineering on a shallow copy of the rows ---
  const work = cleanedRows.map((r) => ({ ...r }));

  for (const feature of engineeredFeatures) {
    try {
      applyEngineeredFeature(work, feature);
    } catch (err) {
      // A broken feature should not abort the whole pipeline — skip and log
      console.error(`[engineerFeatures] Failed to apply "${feature.newColumnName}":`, err);
    }
  }

  // --- Project rows to only the final column set ---
  const finalCols = new Set([
    ...selectedColumns,
    ...engineeredFeatures.map((f) => f.newColumnName),
  ]);

  const vizReadyRows = work.map((row) => {
    const projected: Record<string, unknown> = {};
    for (const col of finalCols) {
      if (col in row) projected[col] = row[col];
    }
    return projected;
  });

  const engineeredMeta: EngineeringMeta = {
    selectedColumns,
    engineeredFeatures,
    totalColumns: finalCols.size,
  };

  return { vizReadyRows, engineeredMeta };
}
