import type {
  EDAResult,
  ColumnDistribution,
  NumericDistribution,
  CategoricalDistribution,
  DatetimeDistribution,
  ColumnRelationship,
  ColumnTrend,
  TemporalTrends,
  CompositionEntry,
} from "@/types/data";

// ---------------------------------------------------------------------------
// Null / coercion helpers
// ---------------------------------------------------------------------------

const NULL_STRINGS = new Set([
  "", "null", "na", "n/a", "nan", "none", "undefined", "-", "—", "missing",
]);

function isNullLike(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return Number.isNaN(v);
  if (typeof v === "string") return NULL_STRINGS.has(v.trim().toLowerCase());
  return false;
}

function toFloat(v: unknown): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/^[$£€¥₹]/, "").replace(/,/g, "");
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;

function toTimestamp(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string") {
    if (!ISO_DATE_RE.test(v.trim()) && Number.isNaN(Date.parse(v))) return null;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof v === "number") return v;
  return null;
}

// ---------------------------------------------------------------------------
// Statistical helpers (no Math.min/max spread — avoids stack overflow)
// ---------------------------------------------------------------------------

function safeMin(nums: number[]): number {
  return nums.reduce((a, b) => (b < a ? b : a), nums[0]);
}

function safeMax(nums: number[]): number {
  return nums.reduce((a, b) => (b > a ? b : a), nums[0]);
}

function computeMean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function computeMedian(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function computeStd(nums: number[], mean: number): number {
  if (nums.length < 2) return 0;
  const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Lightweight dtype classification (per-column, for EDA purposes)
// ---------------------------------------------------------------------------

type SimpleDtype = "numeric" | "categorical" | "datetime" | "boolean";

const BOOL_STRINGS = new Set(["true", "false", "yes", "no", "1", "0"]);

function classifyColumn(
  rows: Record<string, unknown>[],
  col: string
): SimpleDtype {
  const present = rows.map((r) => r[col]).filter((v) => !isNullLike(v));
  if (present.length === 0) return "categorical";

  // Datetime: ≥ 80 % of present values parse as dates
  const dateHits = present.filter((v) => toTimestamp(v) !== null).length;
  if (dateHits / present.length >= 0.8) return "datetime";

  // Numeric: ≥ 80 % parse as floats
  const numHits = present.filter((v) => toFloat(v) !== null).length;
  if (numHits / present.length >= 0.8) return "numeric";

  // Boolean: all unique normalised string values ≤ 2 and all in bool set
  const strs = present.map((v) =>
    (typeof v === "string" ? v.trim().toLowerCase() : String(v))
  );
  const uniq = new Set(strs);
  if (uniq.size <= 2 && [...uniq].every((s) => BOOL_STRINGS.has(s))) return "boolean";

  return "categorical";
}

// ---------------------------------------------------------------------------
// Distribution per column
// ---------------------------------------------------------------------------

function numericDistribution(nums: number[]): NumericDistribution {
  const n = nums.length;
  const bins = Math.max(2, Math.ceil(Math.log2(n) + 1)); // Sturges' rule
  const min = safeMin(nums);
  const max = safeMax(nums);
  const mean = computeMean(nums);
  const median = computeMedian(nums);
  const std = computeStd(nums, mean);

  const width = max === min ? 1 : (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    min: min + i * width,
    max: min + (i + 1) * width,
    count: 0,
  }));

  for (const v of nums) {
    const idx = Math.min(Math.floor((v - min) / width), bins - 1);
    buckets[idx].count++;
  }

  return { type: "numeric", bins: buckets, min, max, mean, median, std };
}

function categoricalDistribution(
  values: string[]
): CategoricalDistribution {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);

  const total = values.length;
  const entries = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }));

  return { type: "categorical", values: entries };
}

function computeDistribution(
  rows: Record<string, unknown>[],
  col: string,
  dtype: SimpleDtype
): ColumnDistribution {
  if (dtype === "numeric") {
    const nums = rows
      .map((r) => toFloat(r[col]))
      .filter((v): v is number => v !== null);
    if (nums.length === 0) {
      return { type: "numeric", bins: [], min: 0, max: 0, mean: 0, median: 0, std: 0 };
    }
    return numericDistribution(nums);
  }

  if (dtype === "datetime") {
    const timestamps = rows
      .map((r) => toTimestamp(r[col]))
      .filter((v): v is number => v !== null);
    if (timestamps.length === 0) {
      return { type: "datetime", min: "", max: "", spanDays: 0 };
    }
    const minTs = safeMin(timestamps);
    const maxTs = safeMax(timestamps);
    return {
      type: "datetime",
      min: new Date(minTs).toISOString(),
      max: new Date(maxTs).toISOString(),
      spanDays: Math.round((maxTs - minTs) / 86_400_000),
    };
  }

  // categorical or boolean
  const strs = rows
    .filter((r) => !isNullLike(r[col]))
    .map((r) =>
      typeof r[col] === "string"
        ? (r[col] as string).trim()
        : String(r[col])
    );
  const dist = categoricalDistribution(strs);
  if (dtype === "boolean") {
    return { ...dist, type: "boolean" } as CategoricalDistribution;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Pearson correlation (pairwise complete observations)
// ---------------------------------------------------------------------------

function pearson(
  xs: (number | null)[],
  ys: (number | null)[]
): number | null {
  const pairs: [number, number][] = [];
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] !== null && ys[i] !== null) {
      pairs.push([xs[i] as number, ys[i] as number]);
    }
  }
  const n = pairs.length;
  if (n < 4) return null;

  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;

  let ssxy = 0, ssxx = 0, ssyy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    ssxy += dx * dy;
    ssxx += dx * dx;
    ssyy += dy * dy;
  }

  const denom = Math.sqrt(ssxx * ssyy);
  if (denom < 1e-12) return null;
  return Math.max(-1, Math.min(1, ssxy / denom));
}

function computeCorrelationMatrix(
  rows: Record<string, unknown>[],
  numericCols: string[]
): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};

  // Pre-extract each column's numeric vector once
  const vectors: Record<string, (number | null)[]> = {};
  for (const col of numericCols) {
    vectors[col] = rows.map((r) => toFloat(r[col]));
    matrix[col] = {};
    matrix[col][col] = 1;
  }

  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const ci = numericCols[i];
      const cj = numericCols[j];
      const r = pearson(vectors[ci], vectors[cj]) ?? 0;
      matrix[ci][cj] = r;
      matrix[cj][ci] = r; // symmetric
    }
  }

  return matrix;
}

// ---------------------------------------------------------------------------
// Top relationships
// ---------------------------------------------------------------------------

function relationshipType(r: number): string {
  const abs = Math.abs(r);
  const dir = r >= 0 ? "positive" : "negative";
  if (abs >= 0.7) return `strong ${dir}`;
  if (abs >= 0.4) return `moderate ${dir}`;
  return `weak ${dir}`;
}

function extractTopRelationships(
  matrix: Record<string, Record<string, number>>,
  numericCols: string[],
  topN = 5
): ColumnRelationship[] {
  const pairs: ColumnRelationship[] = [];

  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const ci = numericCols[i];
      const cj = numericCols[j];
      const strength = matrix[ci]?.[cj] ?? 0;
      pairs.push({ col1: ci, col2: cj, strength, type: relationshipType(strength) });
    }
  }

  return pairs.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength)).slice(0, topN);
}

// ---------------------------------------------------------------------------
// Temporal trends (OLS linear regression, x = row index in time order)
// ---------------------------------------------------------------------------

function linearTrend(xs: number[], ys: number[]): ColumnTrend {
  const n = xs.length;
  const mx = computeMean(xs);
  const my = computeMean(ys);

  let ssxx = 0, ssxy = 0, ssyy = 0;
  for (let i = 0; i < n; i++) {
    ssxx += (xs[i] - mx) ** 2;
    ssxy += (xs[i] - mx) * (ys[i] - my);
    ssyy += (ys[i] - my) ** 2;
  }

  const slope = ssxx < 1e-12 ? 0 : ssxy / ssxx;
  const rSquared = ssyy < 1e-12 ? 0 : Math.min(1, (ssxy * ssxy) / (ssxx * ssyy));

  let direction: "increasing" | "decreasing" | "flat";
  if (rSquared < 0.05) {
    direction = "flat";
  } else {
    direction = slope >= 0 ? "increasing" : "decreasing";
  }

  return { direction, slope, rSquared };
}

function computeTemporalTrends(
  rows: Record<string, unknown>[],
  dateCol: string,
  numericCols: string[]
): TemporalTrends {
  // Sort rows by the date column
  const sorted = [...rows].sort((a, b) => {
    const ta = toTimestamp(a[dateCol]) ?? 0;
    const tb = toTimestamp(b[dateCol]) ?? 0;
    return ta - tb;
  });

  const xs = sorted.map((_, i) => i);
  const trends: Record<string, ColumnTrend> = {};

  for (const col of numericCols) {
    const ys = sorted.map((r) => toFloat(r[col]));
    const paired: [number, number][] = [];
    for (let i = 0; i < xs.length; i++) {
      if (ys[i] !== null) paired.push([xs[i], ys[i] as number]);
    }
    if (paired.length < 4) continue;
    trends[col] = linearTrend(
      paired.map((p) => p[0]),
      paired.map((p) => p[1])
    );
  }

  return { dateColumn: dateCol, trends };
}

// ---------------------------------------------------------------------------
// Compositions: categorical × numeric cross-tabulation
// ---------------------------------------------------------------------------

function computeCompositions(
  rows: Record<string, unknown>[],
  categoricalCols: string[],
  numericCols: string[]
): Record<string, Record<string, CompositionEntry[]>> {
  const result: Record<string, Record<string, CompositionEntry[]>> = {};

  for (const catCol of categoricalCols) {
    result[catCol] = {};

    for (const numCol of numericCols) {
      const countMap = new Map<string, number>();
      const sumMap = new Map<string, number>();

      for (const row of rows) {
        if (isNullLike(row[catCol])) continue;
        const cat =
          typeof row[catCol] === "string"
            ? (row[catCol] as string).trim()
            : String(row[catCol]);

        countMap.set(cat, (countMap.get(cat) ?? 0) + 1);

        const num = toFloat(row[numCol]);
        if (num !== null) {
          sumMap.set(cat, (sumMap.get(cat) ?? 0) + num);
        }
      }

      const total = rows.filter((r) => !isNullLike(r[catCol])).length;
      const entries: CompositionEntry[] = [...countMap.entries()]
        .map(([value, count]) => ({
          value,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
          mean: sumMap.has(value) ? (sumMap.get(value) as number) / count : null,
        }))
        .sort((a, b) => b.count - a.count);

      if (entries.length > 0) result[catCol][numCol] = entries;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function runEDA(
  vizReadyRows: Record<string, unknown>[],
  selectedColumns: string[]
): EDAResult {
  if (vizReadyRows.length === 0 || selectedColumns.length === 0) {
    return {
      correlationMatrix: {},
      distributions: {},
      topRelationships: [],
      temporalTrends: null,
      compositions: {},
    };
  }

  // Classify each selected column
  const dtypeMap = new Map<string, SimpleDtype>();
  for (const col of selectedColumns) {
    dtypeMap.set(col, classifyColumn(vizReadyRows, col));
  }

  const numericCols = selectedColumns.filter((c) => dtypeMap.get(c) === "numeric");
  const categoricalCols = selectedColumns.filter(
    (c) => dtypeMap.get(c) === "categorical" || dtypeMap.get(c) === "boolean"
  );
  const datetimeCols = selectedColumns.filter((c) => dtypeMap.get(c) === "datetime");

  // Distributions
  const distributions: Record<string, ColumnDistribution> = {};
  for (const col of selectedColumns) {
    distributions[col] = computeDistribution(
      vizReadyRows,
      col,
      dtypeMap.get(col) as SimpleDtype
    );
  }

  // Correlation matrix + top relationships
  const correlationMatrix =
    numericCols.length >= 2
      ? computeCorrelationMatrix(vizReadyRows, numericCols)
      : {};

  const topRelationships =
    numericCols.length >= 2
      ? extractTopRelationships(correlationMatrix, numericCols)
      : [];

  // Temporal trends — use the first datetime column found
  let temporalTrends: TemporalTrends | null = null;
  if (datetimeCols.length > 0 && numericCols.length > 0) {
    temporalTrends = computeTemporalTrends(
      vizReadyRows,
      datetimeCols[0],
      numericCols
    );
  }

  // Compositions
  const compositions =
    categoricalCols.length > 0 && numericCols.length > 0
      ? computeCompositions(vizReadyRows, categoricalCols, numericCols)
      : {};

  return {
    correlationMatrix,
    distributions,
    topRelationships,
    temporalTrends,
    compositions,
  };
}
