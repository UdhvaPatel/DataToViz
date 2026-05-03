import type { DataProfile, ContextPackage } from "@/types/data";

const FULL_DATASET_THRESHOLD = 1000;
const TARGET_SAMPLE_SIZE = 28; // sits comfortably within the 25-30 target
const SEGMENT_SIZE = 10;       // rows per time-series segment (start/mid/end)

// ---------------------------------------------------------------------------
// Low-level utilities
// ---------------------------------------------------------------------------

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

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Stringify a cell value the same way the profiler's topValues does. */
function cellToStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Reservoir sample — O(n), Vitter's Algorithm R.
 * Returns a new array of up to k items chosen uniformly at random.
 */
function reservoirSample<T>(arr: T[], k: number): T[] {
  if (arr.length <= k) return [...arr];
  const result = arr.slice(0, k);
  for (let i = k; i < arr.length; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < k) result[j] = arr[i];
  }
  return result;
}

/**
 * Merge multiple arrays, deduplicating by object reference.
 * Row identity is safe here because we never clone rows — all sampling
 * hands back pointers into the original array.
 */
function mergeUnique(
  ...arrays: Record<string, unknown>[][]
): Record<string, unknown>[] {
  const seen = new Set<Record<string, unknown>>();
  const out: Record<string, unknown>[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Strategy 1 – Time-series: start / middle / end segments
// ---------------------------------------------------------------------------

function sampleTimeSeries(
  rows: Record<string, unknown>[],
  profile: DataProfile
): Record<string, unknown>[] {
  const dateCol = profile.columns.find((c) => c.dtype === "datetime");

  // Sort chronologically when a datetime column exists; otherwise use row order.
  const ordered = dateCol
    ? [...rows].sort((a, b) => {
        const da = toDate(a[dateCol.name]);
        const db = toDate(b[dateCol.name]);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      })
    : rows;

  const n = ordered.length;
  const midStart = Math.max(0, Math.floor(n / 2) - Math.floor(SEGMENT_SIZE / 2));

  return mergeUnique(
    ordered.slice(0, SEGMENT_SIZE),
    ordered.slice(midStart, midStart + SEGMENT_SIZE),
    ordered.slice(Math.max(0, n - SEGMENT_SIZE))
  );
}

// ---------------------------------------------------------------------------
// Strategy 2 – Default: proportional stratified random sample
// ---------------------------------------------------------------------------

function sampleStratified(
  rows: Record<string, unknown>[],
  profile: DataProfile,
  targetSize: number
): Record<string, unknown>[] {
  // Pick the best categorical column to stratify on:
  // bounded cardinality (2–20 classes), low nulls, not "high cardinality"
  const stratCol = profile.columns.find(
    (c) =>
      c.dtype === "categorical" &&
      !c.anomalies.includes("high cardinality") &&
      c.nullPercentage < 50 &&
      c.uniqueCount >= 2 &&
      c.uniqueCount <= 20
  );

  if (!stratCol) return reservoirSample(rows, targetSize);

  // Bucket rows by stratum value
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = cellToStr(row[stratCol.name]) || "__null__";
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const result: Record<string, unknown>[] = [];
  for (const [, bucket] of groups) {
    const proportion = bucket.length / rows.length;
    // Floor at 2 so minority strata always contribute at least two rows
    const quota = Math.max(2, Math.round(proportion * targetSize));
    result.push(...reservoirSample(bucket, quota));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Augmentation A – Minority class rows for skewed categoricals
// ---------------------------------------------------------------------------

function getMinorityClassRows(
  rows: Record<string, unknown>[],
  profile: DataProfile
): Record<string, unknown>[] {
  const forced: Record<string, unknown>[] = [];

  for (const col of profile.columns) {
    if (col.dtype !== "categorical") continue;
    if (!col.topValues || col.topValues.length < 2) continue;

    // Only augment when one class dominates (>60 % of non-null values)
    if (col.topValues[0].percentage <= 60) continue;

    // Collect 2 rows for each non-dominant class
    for (const minority of col.topValues.slice(1)) {
      const matching = rows.filter(
        (r) => cellToStr(r[col.name]) === minority.value
      );
      forced.push(...reservoirSample(matching, 2));
    }
  }

  return forced;
}

// ---------------------------------------------------------------------------
// Augmentation B – Rows near outlier boundaries for skewed numeric columns
// ---------------------------------------------------------------------------

function getOutlierRows(
  rows: Record<string, unknown>[],
  profile: DataProfile
): Record<string, unknown>[] {
  const forced: Record<string, unknown>[] = [];

  for (const col of profile.columns) {
    if (col.dtype !== "numeric" || !col.numericStats) continue;

    const { min, max, mean, std } = col.numericStats;
    if (std === 0) continue;

    // 3-sigma rule: at least one tail must be an extreme outlier
    const upperZ = (max - mean) / std;
    const lowerZ = (mean - min) / std;
    if (upperZ <= 3 && lowerZ <= 3) continue;

    // For each anchor point, find the single row whose value is closest
    for (const anchor of [min, max, mean]) {
      let best: Record<string, unknown> | null = null;
      let bestDist = Infinity;

      for (const row of rows) {
        const v = toFloat(row[col.name]);
        if (v === null) continue;
        const dist = Math.abs(v - anchor);
        if (dist < bestDist) {
          bestDist = dist;
          best = row;
        }
      }

      if (best) forced.push(best);
    }
  }

  return forced;
}

// ---------------------------------------------------------------------------
// Master sampling dispatcher
// ---------------------------------------------------------------------------

function sampleRows(
  rows: Record<string, unknown>[],
  profile: DataProfile
): Record<string, unknown>[] {
  // Small datasets: send everything — no value in sub-sampling
  if (rows.length < FULL_DATASET_THRESHOLD) return rows;

  const base =
    profile.datasetType === "time-series"
      ? sampleTimeSeries(rows, profile)
      : sampleStratified(rows, profile, TARGET_SAMPLE_SIZE);

  return mergeUnique(
    base,
    getMinorityClassRows(rows, profile),
    getOutlierRows(rows, profile)
  );
}

// ---------------------------------------------------------------------------
// Profile summary — concise text block for the LLM prompt
// ---------------------------------------------------------------------------

function fmt(n: number, dp = 2): string {
  return n.toFixed(dp);
}

function buildProfileSummary(profile: DataProfile): string {
  const lines: string[] = [
    `Dataset type: ${profile.datasetType}`,
    `Dimensions: ${profile.rowCount.toLocaleString()} rows × ${profile.columnCount} columns`,
    "",
    "Column profiles:",
  ];

  for (const col of profile.columns) {
    const nullTag =
      col.nullPercentage > 0 ? `, ${fmt(col.nullPercentage, 1)}% null` : "";

    if (col.dtype === "numeric" && col.numericStats) {
      const s = col.numericStats;
      lines.push(
        `  "${col.name}" [numeric]: ` +
          `range [${fmt(s.min)} → ${fmt(s.max)}], ` +
          `mean=${fmt(s.mean)}, std=${fmt(s.std)}, ` +
          `skewness=${fmt(s.skewness)}` +
          nullTag
      );
    } else if (
      (col.dtype === "categorical" || col.dtype === "boolean") &&
      col.topValues
    ) {
      const top = col.topValues
        .slice(0, 3)
        .map((tv) => `${tv.value} (${fmt(tv.percentage, 1)}%)`)
        .join(", ");
      lines.push(
        `  "${col.name}" [${col.dtype}]: ` +
          `${col.uniqueCount} unique — ${top}` +
          nullTag
      );
    } else {
      // datetime or empty categorical
      lines.push(`  "${col.name}" [${col.dtype}]` + nullTag);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Anomaly flags — one plain-English string per flagged column
// ---------------------------------------------------------------------------

function collectAnomalyFlags(profile: DataProfile): string[] {
  const flags: string[] = [];

  for (const col of profile.columns) {
    for (const anomaly of col.anomalies) {
      switch (anomaly) {
        case "high null %":
          flags.push(
            `column "${col.name}" has ${fmt(col.nullPercentage, 0)}% nulls`
          );
          break;

        case "heavily skewed":
          flags.push(
            `column "${col.name}" is heavily skewed ` +
              `(skewness: ${fmt(col.numericStats!.skewness)})`
          );
          break;

        case "low variance":
          flags.push(
            `column "${col.name}" has low variance ` +
              `(${col.uniqueCount} unique numeric value${col.uniqueCount === 1 ? "" : "s"})`
          );
          break;

        case "high cardinality":
          flags.push(
            `column "${col.name}" has high cardinality ` +
              `(${col.uniqueCount} unique values across ${profile.rowCount.toLocaleString()} rows)`
          );
          break;
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildContextPackage(
  rows: Record<string, unknown>[],
  profile: DataProfile
): ContextPackage {
  return {
    sampledRows: sampleRows(rows, profile).slice(0, 30),
    profileSummary: buildProfileSummary(profile),
    anomalyFlags: collectAnomalyFlags(profile),
    datasetType: profile.datasetType,
  };
}
