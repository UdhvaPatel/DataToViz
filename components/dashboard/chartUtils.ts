// Shared data-transformation helpers used across chart components.

export type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Value coercion
// ---------------------------------------------------------------------------

export function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(/[$£€¥₹,]/g, ""));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Aggregate rows by a single key column, summing the value column.
 * Returns entries sorted by name (string sort).
 */
export function aggregateRows(
  rows: Row[],
  nameKey: string,
  valueKey: string
): { name: string; value: number }[] {
  const agg = new Map<string, number>();
  for (const row of rows) {
    if (row[nameKey] == null) continue;
    const name = toStr(row[nameKey]);
    const val = toNum(row[valueKey]) ?? 0;
    agg.set(name, (agg.get(name) ?? 0) + val);
  }
  return [...agg.entries()].map(([name, value]) => ({ name, value }));
}

/**
 * Pivot rows for grouped bar / line charts.
 * Returns { data, groups } where data is recharts-ready (each entry has a
 * "name" key plus one key per group) and groups is the ordered group list.
 */
export function pivotRows(
  rows: Row[],
  nameKey: string,
  valueKey: string,
  groupKey: string
): { data: Record<string, unknown>[]; groups: string[] } {
  const groupSet = new Set<string>();
  const agg = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (row[nameKey] == null) continue;
    const name = toStr(row[nameKey]);
    const group = toStr(row[groupKey] ?? "value");
    const val = toNum(row[valueKey]) ?? 0;
    groupSet.add(group);
    if (!agg.has(name)) agg.set(name, new Map());
    agg.get(name)!.set(group, (agg.get(name)!.get(group) ?? 0) + val);
  }

  const groups = [...groupSet].slice(0, 8); // cap groups to avoid visual overload
  const data = [...agg.entries()].map(([name, m]) => {
    const entry: Record<string, unknown> = { name };
    for (const g of groups) entry[g] = m.get(g) ?? 0;
    return entry;
  });

  return { data, groups };
}

// ---------------------------------------------------------------------------
// Histogram bins (Sturges' rule)
// ---------------------------------------------------------------------------

export interface HistBin {
  name: string;
  count: number;
  min: number;
  max: number;
}

export function computeBins(values: number[]): HistBin[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const numBins = Math.max(2, Math.ceil(Math.log2(values.length) + 1));
  const width = max === min ? 1 : (max - min) / numBins;

  const bins: HistBin[] = Array.from({ length: numBins }, (_, i) => ({
    min: min + i * width,
    max: min + (i + 1) * width,
    count: 0,
    name: "",
  }));

  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / width), numBins - 1);
    bins[idx].count++;
  }

  return bins.map((b) => ({
    ...b,
    name: `${b.min.toFixed(1)}–${b.max.toFixed(1)}`,
  }));
}

// ---------------------------------------------------------------------------
// Heatmap matrix
// ---------------------------------------------------------------------------

export interface HeatmapMatrix {
  xValues: string[];
  yValues: string[];
  matrix: number[][];
  min: number;
  max: number;
}

export function buildHeatmapMatrix(
  rows: Row[],
  xKey: string,
  yKey: string
): HeatmapMatrix {
  const xSet = new Set<string>();
  const ySet = new Set<string>();

  for (const row of rows) {
    if (row[xKey] != null) xSet.add(toStr(row[xKey]));
    if (row[yKey] != null) ySet.add(toStr(row[yKey]));
  }

  const xValues = [...xSet].slice(0, 20); // cap for readability
  const yValues = [...ySet].slice(0, 20);
  const xIdx = new Map(xValues.map((v, i) => [v, i]));
  const yIdx = new Map(yValues.map((v, i) => [v, i]));

  const matrix: number[][] = Array.from({ length: yValues.length }, () =>
    new Array(xValues.length).fill(0)
  );

  for (const row of rows) {
    const xi = xIdx.get(toStr(row[xKey]));
    const yi = yIdx.get(toStr(row[yKey]));
    if (xi !== undefined && yi !== undefined) matrix[yi][xi]++;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const row of matrix) {
    for (const v of row) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  return { xValues, yValues, matrix, min, max: max === min ? min + 1 : max };
}

// ---------------------------------------------------------------------------
// Truncate long axis labels
// ---------------------------------------------------------------------------

export function truncate(s: string, max = 14): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
