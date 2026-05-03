import { callGroq } from "@/lib/data/groqServer";
import type {
  EDAResult,
  PromptUnderstanding,
  EngineeringMeta,
  DashboardBlueprint,
  ChartBlueprint,
  ChartType,
  ChartRelevance,
  ColumnDistribution,
} from "@/types/data";

// ---------------------------------------------------------------------------
// Valid enum members
// ---------------------------------------------------------------------------

const VALID_CHART_TYPES: ReadonlySet<ChartType> = new Set([
  "bar", "line", "scatter", "pie", "donut",
  "histogram", "heatmap", "bubble", "funnel",
]);

const VALID_RELEVANCE: ReadonlySet<ChartRelevance> = new Set([
  "high", "medium", "exploratory",
]);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert data visualisation designer.
You will receive:
  1. What the user wants to understand from their data (intent + target).
  2. The columns available in the viz-ready dataset (original + engineered).
  3. Key EDA insights: top correlations, temporal trends, compositions, distribution notes.

Your job is to design a dashboard of 3–8 charts that best answer the user's question.
Return a single JSON object — nothing else, no markdown, no explanation:

{
  "dashboardTitle": "<concise title for the whole dashboard>",
  "dashboardNarrative": "<2–3 sentences: what the dashboard reveals and why it matters>",
  "charts": [
    {
      "chartId": "<unique slug, e.g. revenue_by_region>",
      "chartType": "<one of the types below>",
      "title": "<chart title>",
      "xAxis": "<column name or null>",
      "yAxis": "<column name or null>",
      "groupBy": "<column name or null>",
      "colorBy": "<column name or null>",
      "narrative": "<what this chart shows and why it matters for the user's question>",
      "relevance": "<high | medium | exploratory>",
      "order": <integer starting at 1, high-relevance charts first>
    }
  ]
}

Chart type selection rules — choose the MOST APPROPRIATE type for the data:
  bar        → compare a numeric metric across discrete categories or ranked items
  line       → show how a numeric metric changes over time or an ordered sequence
  scatter    → reveal correlation or relationship between two numeric columns
  pie        → show part-to-whole composition when there are 2–5 slices
  donut      → same as pie but preferred when a centre metric label adds value
  histogram  → show the distribution / frequency shape of a single numeric column
  heatmap    → show density, frequency, or correlation intensity across two dimensions (e.g. correlation matrix, categorical × categorical counts)
  bubble     → encode a third numeric variable as bubble size on a scatter plot
  funnel     → visualise drop-off or sequential conversion through ordered stages

Relevance rules:
  high        → directly answers the user's stated question; must come first
  medium      → provides supporting context for the main question
  exploratory → interesting pattern found in EDA; secondary, not directly asked for

Axis / field rules:
  - Use EXACT column names as they appear in the available columns list.
  - xAxis / yAxis / groupBy / colorBy must each be a column name from the list, or null.
  - For histogram: xAxis = the column, yAxis = null.
  - For pie/donut: xAxis = category column, yAxis = numeric column, groupBy = null.
  - For heatmap: xAxis = first dimension, yAxis = second dimension, groupBy = null.
  - Never invent column names.

Output rules:
  - Every chartId must be unique.
  - Order charts so that order:1 is the single most insightful chart.
  - Produce between 3 and 8 charts; do not exceed 8.
  - Return ONLY the JSON object.`;

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

function describeDistribution(dist: ColumnDistribution): string {
  if (dist.type === "numeric") {
    return `numeric, range [${dist.min.toFixed(2)}, ${dist.max.toFixed(2)}], mean ${dist.mean.toFixed(2)}, std ${dist.std.toFixed(2)}`;
  }
  if (dist.type === "datetime") {
    return `datetime, span ${dist.spanDays} days (${dist.min.slice(0, 10)} → ${dist.max.slice(0, 10)})`;
  }
  // categorical / boolean
  const top = dist.values
    .slice(0, 3)
    .map((v) => `"${v.value}" (${v.percentage.toFixed(1)}%)`)
    .join(", ");
  return `${dist.type}, ${dist.values.length} unique values — top: ${top}`;
}

function buildUserMessage(
  eda: EDAResult,
  prompt: PromptUnderstanding,
  meta: EngineeringMeta
): string {
  const parts: string[] = [];

  // 1. What the user wants
  parts.push("=== PROMPT UNDERSTANDING ===");
  parts.push(`Intent: ${prompt.intent}`);
  parts.push(`Target: ${prompt.target}`);
  if (prompt.entities.length > 0) {
    parts.push(`Key entities: ${prompt.entities.join(", ")}`);
  }

  // 2. Available columns
  parts.push("\n=== AVAILABLE COLUMNS ===");
  const engineeredNames = new Set(
    meta.engineeredFeatures.map((f) => f.newColumnName)
  );
  for (const col of meta.selectedColumns) {
    const tag = engineeredNames.has(col) ? " [engineered]" : "";
    const distDesc = eda.distributions[col]
      ? `  — ${describeDistribution(eda.distributions[col])}`
      : "";
    parts.push(`  "${col}"${tag}${distDesc}`);
  }

  // 3. Top correlations
  if (eda.topRelationships.length > 0) {
    parts.push("\n=== TOP CORRELATIONS ===");
    for (const rel of eda.topRelationships) {
      parts.push(
        `  "${rel.col1}" × "${rel.col2}": r=${rel.strength.toFixed(3)} (${rel.type})`
      );
    }
  }

  // 4. Temporal trends
  if (eda.temporalTrends) {
    const { dateColumn, trends } = eda.temporalTrends;
    parts.push(`\n=== TEMPORAL TRENDS (date column: "${dateColumn}") ===`);
    for (const [col, trend] of Object.entries(trends)) {
      parts.push(
        `  "${col}": ${trend.direction} (slope=${trend.slope.toExponential(3)}, R²=${trend.rSquared.toFixed(3)})`
      );
    }
  }

  // 5. Compositions — one line per categorical × numeric pair
  const compEntries: string[] = [];
  for (const [catCol, numMap] of Object.entries(eda.compositions)) {
    for (const [numCol, entries] of Object.entries(numMap)) {
      if (entries.length === 0) continue;
      const preview = entries
        .slice(0, 3)
        .map((e) => `"${e.value}": mean=${e.mean !== null ? e.mean.toFixed(2) : "n/a"} (${e.percentage.toFixed(1)}%)`)
        .join("; ");
      compEntries.push(`  "${catCol}" × "${numCol}": ${preview}`);
    }
  }
  if (compEntries.length > 0) {
    parts.push("\n=== COMPOSITIONS (categorical × numeric) ===");
    parts.push(...compEntries.slice(0, 10)); // cap to keep message size reasonable
  }

  // 6. Engineered features (brief)
  if (meta.engineeredFeatures.length > 0) {
    parts.push("\n=== ENGINEERED FEATURES ===");
    for (const f of meta.engineeredFeatures) {
      parts.push(`  "${f.newColumnName}" (${f.technique}): ${f.reason}`);
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Response normalisation
// ---------------------------------------------------------------------------

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function normaliseChart(raw: unknown, index: number): ChartBlueprint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const chartType = VALID_CHART_TYPES.has(r.chartType as ChartType)
    ? (r.chartType as ChartType)
    : "bar";
  const relevance = VALID_RELEVANCE.has(r.relevance as ChartRelevance)
    ? (r.relevance as ChartRelevance)
    : "medium";

  const title = asString(r.title, `Chart ${index + 1}`);
  const rawId = asString(r.chartId, "");
  const chartId = rawId !== "" ? rawId : slugify(title) || `chart_${index + 1}`;

  return {
    chartId,
    chartType,
    title,
    xAxis: asStringOrNull(r.xAxis),
    yAxis: asStringOrNull(r.yAxis),
    groupBy: asStringOrNull(r.groupBy),
    colorBy: asStringOrNull(r.colorBy),
    narrative: asString(r.narrative, title),
    relevance,
    order: asNumber(r.order, index + 1),
  };
}

function deduplicateIds(charts: ChartBlueprint[]): ChartBlueprint[] {
  const seen = new Set<string>();
  return charts.map((c, i) => {
    let id = c.chartId;
    if (seen.has(id)) id = `${id}_${i + 1}`;
    seen.add(id);
    return { ...c, chartId: id };
  });
}

function normaliseResponse(raw: unknown): DashboardBlueprint {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Expected a JSON object, got: ${JSON.stringify(raw).slice(0, 120)}`
    );
  }

  const r = raw as Record<string, unknown>;

  const dashboardTitle = asString(r.dashboardTitle, "Data Dashboard");
  const dashboardNarrative = asString(r.dashboardNarrative, "Explore your data.");

  const rawCharts = Array.isArray(r.charts) ? r.charts : [];
  const charts: ChartBlueprint[] = rawCharts
    .map((c, i) => normaliseChart(c, i))
    .filter((c): c is ChartBlueprint => c !== null)
    .slice(0, 8); // hard cap

  if (charts.length === 0) {
    throw new Error("LLM returned zero valid charts");
  }

  // Sort by order field so consumers get a predictable sequence
  charts.sort((a, b) => a.order - b.order);

  return {
    dashboardTitle,
    dashboardNarrative,
    charts: deduplicateIds(charts),
  };
}

// ---------------------------------------------------------------------------
// Fallback — built locally when the LLM call fails entirely
// ---------------------------------------------------------------------------

function buildFallback(
  eda: EDAResult,
  prompt: PromptUnderstanding,
  meta: EngineeringMeta
): DashboardBlueprint {
  const charts: ChartBlueprint[] = [];
  let order = 1;

  const cols = meta.selectedColumns;

  // Classify columns by distribution type
  const numericCols = cols.filter(
    (c) => eda.distributions[c]?.type === "numeric"
  );
  const categoricalCols = cols.filter(
    (c) =>
      eda.distributions[c]?.type === "categorical" ||
      eda.distributions[c]?.type === "boolean"
  );
  const datetimeCols = cols.filter(
    (c) => eda.distributions[c]?.type === "datetime"
  );

  // Line chart for the first trending numeric × datetime
  if (datetimeCols.length > 0 && numericCols.length > 0) {
    const numCol = eda.temporalTrends
      ? Object.keys(eda.temporalTrends.trends)[0] ?? numericCols[0]
      : numericCols[0];
    charts.push({
      chartId: `${slugify(numCol)}_over_time`,
      chartType: "line",
      title: `${numCol} over time`,
      xAxis: datetimeCols[0],
      yAxis: numCol,
      groupBy: null,
      colorBy: null,
      narrative: `Tracks how ${numCol} changes over time.`,
      relevance: "high",
      order: order++,
    });
  }

  // Bar chart for top categorical × numeric composition
  if (categoricalCols.length > 0 && numericCols.length > 0) {
    charts.push({
      chartId: `${slugify(numericCols[0])}_by_${slugify(categoricalCols[0])}`,
      chartType: "bar",
      title: `${numericCols[0]} by ${categoricalCols[0]}`,
      xAxis: categoricalCols[0],
      yAxis: numericCols[0],
      groupBy: null,
      colorBy: categoricalCols[0],
      narrative: `Compares ${numericCols[0]} across ${categoricalCols[0]} groups.`,
      relevance: "high",
      order: order++,
    });
  }

  // Scatter for top correlation pair
  if (eda.topRelationships.length > 0) {
    const rel = eda.topRelationships[0];
    charts.push({
      chartId: `${slugify(rel.col1)}_vs_${slugify(rel.col2)}`,
      chartType: "scatter",
      title: `${rel.col1} vs ${rel.col2}`,
      xAxis: rel.col1,
      yAxis: rel.col2,
      groupBy: null,
      colorBy: categoricalCols[0] ?? null,
      narrative: `Shows the ${rel.type} relationship (r=${rel.strength.toFixed(2)}) between ${rel.col1} and ${rel.col2}.`,
      relevance: "medium",
      order: order++,
    });
  }

  // Histogram for first numeric column without a line chart
  const histCol = numericCols.find((c) =>
    !charts.some((ch) => ch.yAxis === c && ch.chartType === "line")
  );
  if (histCol) {
    charts.push({
      chartId: `${slugify(histCol)}_distribution`,
      chartType: "histogram",
      title: `Distribution of ${histCol}`,
      xAxis: histCol,
      yAxis: null,
      groupBy: null,
      colorBy: null,
      narrative: `Shows how ${histCol} values are distributed.`,
      relevance: "exploratory",
      order: order++,
    });
  }

  return {
    dashboardTitle: prompt.target || "Data Dashboard",
    dashboardNarrative:
      "Fallback dashboard generated from EDA insights. LLM analysis was unavailable.",
    charts,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateBlueprint(
  edaResult: EDAResult,
  promptUnderstanding: PromptUnderstanding,
  engineeredMeta: EngineeringMeta
): Promise<DashboardBlueprint> {
  const userMessage = buildUserMessage(
    edaResult,
    promptUnderstanding,
    engineeredMeta
  );

  let raw: unknown;
  try {
    raw = await callGroq(SYSTEM_PROMPT, userMessage);
  } catch (err) {
    console.error("[generateBlueprint] Groq call failed:", err);
    return buildFallback(edaResult, promptUnderstanding, engineeredMeta);
  }

  try {
    return normaliseResponse(raw);
  } catch (err) {
    console.error("[generateBlueprint] Response normalisation failed:", err);
    return buildFallback(edaResult, promptUnderstanding, engineeredMeta);
  }
}
