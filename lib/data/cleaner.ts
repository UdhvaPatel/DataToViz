import { profileDataset } from "@/lib/data/profiler";
import type {
  ColumnCleaningStep,
  DataProfile,
  CleaningDiff,
  CleanDatasetResult,
  ImputedColumn,
  OutlierHandled,
} from "@/types/data";

// ---------------------------------------------------------------------------
// Utilities — mirrored from the profiler so we stay consistent on what
// "null-like" and "numeric" mean across the pipeline.
// ---------------------------------------------------------------------------

const NULL_STRINGS = new Set([
  "",
  "null",
  "na",
  "n/a",
  "nan",
  "none",
  "undefined",
  "-",
  "—",
  "missing",
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

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/** Linear interpolation percentile on a pre-sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

function arithmeticMean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function modeOf(values: string[]): string | undefined {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [v, c] of freq) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Step 1 — Standardise strings
//
// Trims leading/trailing whitespace and collapses internal runs of whitespace
// on every string value in the dataset.  For columns the profiler classified
// as "categorical" we also lowercase, so "Male", "MALE", and "male" all merge
// into one category before deduplication and mode-imputation.
// ---------------------------------------------------------------------------

function standardizeStrings(
  rows: Record<string, unknown>[],
  profile: DataProfile
): void {
  const categoricalCols = new Set(
    profile.columns.filter((c) => c.dtype === "categorical").map((c) => c.name)
  );

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (typeof row[key] === "string") {
        const normalised = (row[key] as string).trim().replace(/\s+/g, " ");
        row[key] = categoricalCols.has(key) ? normalised.toLowerCase() : normalised;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Normalise date columns to ISO 8601 strings
//
// Handles Date objects (from the xlsx parser with cellDates:true), numeric
// Unix timestamps, and date-formatted strings.  Non-parseable values are left
// unchanged so they show up as nulls in the re-profile rather than silently
// disappearing.
// ---------------------------------------------------------------------------

function toISO(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v as string | number);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function normalizeDates(rows: Record<string, unknown>[], profile: DataProfile): void {
  const dateCols = profile.columns
    .filter((c) => c.dtype === "datetime")
    .map((c) => c.name);

  for (const col of dateCols) {
    for (const row of rows) {
      if (isNullLike(row[col])) continue;
      const iso = toISO(row[col]);
      // Keep original value if conversion fails so the profiler can still
      // see that a value was present (and classify it appropriately).
      if (iso !== null) row[col] = iso;
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Cap outliers via IQR fences
//
// Only runs on columns where the cleaning plan specifies "cap_outliers".
// Requires at least 4 non-null numeric values to compute a meaningful IQR;
// constant columns (IQR = 0) are silently skipped.
// Values outside [Q1 − 1.5×IQR, Q3 + 1.5×IQR] are clamped to the fence.
// ---------------------------------------------------------------------------

function capOutliers(
  rows: Record<string, unknown>[],
  plan: ColumnCleaningStep[]
): OutlierHandled[] {
  const result: OutlierHandled[] = [];

  for (const step of plan) {
    if (step.action !== "cap_outliers") continue;
    const col = step.columnName;

    const nums = rows
      .map((r) => toFloat(r[col]))
      .filter((v): v is number => v !== null);

    if (nums.length < 4) continue;

    const sorted = [...nums].sort((a, b) => a - b);
    const q1 = percentile(sorted, 25);
    const q3 = percentile(sorted, 75);
    const iqr = q3 - q1;
    if (iqr === 0) continue;

    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    let count = 0;

    for (const row of rows) {
      const v = toFloat(row[col]);
      if (v === null) continue;
      if (v < lower) { row[col] = lower; count++; }
      else if (v > upper) { row[col] = upper; count++; }
    }

    if (count > 0) result.push({ column: col, count });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 4 — Impute nulls
//
// Applied after capping so that mean/median are computed on the already-capped
// distribution — outliers won't inflate the fill value.
// ---------------------------------------------------------------------------

function imputeNulls(
  rows: Record<string, unknown>[],
  plan: ColumnCleaningStep[]
): ImputedColumn[] {
  const result: ImputedColumn[] = [];

  for (const step of plan) {
    const { columnName: col, action } = step;

    // Skip actions handled elsewhere
    if (action === "keep" || action === "drop" || action === "cap_outliers") continue;

    const nullIdx = rows
      .map((r, i) => (isNullLike(r[col]) ? i : -1))
      .filter((i) => i !== -1);

    if (nullIdx.length === 0) continue;

    let fill: unknown;

    if (action === "impute_mean") {
      const nums = rows
        .filter((r) => !isNullLike(r[col]))
        .map((r) => toFloat(r[col]))
        .filter((v): v is number => v !== null);
      if (nums.length === 0) continue;
      fill = arithmeticMean(nums);
    }

    if (action === "impute_median") {
      const nums = rows
        .filter((r) => !isNullLike(r[col]))
        .map((r) => toFloat(r[col]))
        .filter((v): v is number => v !== null);
      if (nums.length === 0) continue;
      fill = median(nums);
    }

    if (action === "impute_mode") {
      const present = rows
        .filter((r) => !isNullLike(r[col]))
        .map((r) =>
          typeof r[col] === "string" ? (r[col] as string).trim() : String(r[col])
        );
      fill = modeOf(present);
      if (fill === undefined) continue;
    }

    if (action === "impute_placeholder") {
      fill = "Unknown";
    }

    for (const i of nullIdx) rows[i][col] = fill;
    result.push({ column: col, strategy: action, count: nullIdx.length });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 5 — Drop columns
//
// Executed after imputation so that statistics (mean, mode) computed during
// imputation use the full original column set.  Returns the ordered list of
// columns that remain and those that were removed.
// ---------------------------------------------------------------------------

function dropColumns(
  rows: Record<string, unknown>[],
  plan: ColumnCleaningStep[],
  originalColumns: string[]
): { remainingColumns: string[]; droppedColumns: string[] } {
  const toDrop = new Set(
    plan.filter((s) => s.action === "drop").map((s) => s.columnName)
  );

  if (toDrop.size === 0) {
    return { remainingColumns: originalColumns, droppedColumns: [] };
  }

  for (const row of rows) {
    for (const col of toDrop) delete row[col];
  }

  return {
    droppedColumns: [...toDrop].filter((c) => originalColumns.includes(c)),
    remainingColumns: originalColumns.filter((c) => !toDrop.has(c)),
  };
}

// ---------------------------------------------------------------------------
// Step 5b — Coerce numeric columns to JS number
//
// After imputation and before dedup: string values like "65.5" that slipped
// through parsing are converted to actual JS numbers so downstream chart
// components and filter range sliders receive the correct type.
// ---------------------------------------------------------------------------

function coerceNumericColumns(
  rows: Record<string, unknown>[],
  profile: DataProfile,
  remainingColumns: string[]
): void {
  const remaining = new Set(remainingColumns);
  const numericCols = profile.columns
    .filter((c) => c.dtype === "numeric" && remaining.has(c.name))
    .map((c) => c.name);

  for (const col of numericCols) {
    for (const row of rows) {
      if (row[col] === null || row[col] === undefined) continue;
      row[col] = toFloat(row[col]); // null for unparseable; number otherwise
    }
  }
}

// ---------------------------------------------------------------------------
// Step 6 — Remove exact duplicate rows
//
// Runs last so that all normalisation (casing, whitespace, date format,
// imputed values) has already been applied — two rows that only differed
// in whitespace or casing are now correctly identified as the same row.
// ---------------------------------------------------------------------------

function removeDuplicates(rows: Record<string, unknown>[]): {
  unique: Record<string, unknown>[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];

  for (const row of rows) {
    // Stable serialisation: sort keys so insertion-order differences don't
    // produce different keys for logically identical rows.
    const key = JSON.stringify(row, Object.keys(row).sort());
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }

  return { unique, duplicatesRemoved: rows.length - unique.length };
}

// ---------------------------------------------------------------------------
// Distribution warnings — post-cleaning comparison
//
// Flags cases where cleaning shifted the distribution more than expected.
// This helps catch accidental over-imputation or aggressive capping.
// ---------------------------------------------------------------------------

function detectDistributionWarnings(
  original: DataProfile,
  cleaned: DataProfile,
  droppedColumns: string[]
): string[] {
  const warnings: string[] = [];
  const dropped = new Set(droppedColumns);

  for (const origCol of original.columns) {
    if (dropped.has(origCol.name)) continue;

    const cleanedCol = cleaned.columns.find((c) => c.name === origCol.name);
    if (!cleanedCol) continue;

    if (
      origCol.dtype === "numeric" &&
      origCol.numericStats &&
      cleanedCol.numericStats
    ) {
      const { mean: oMean, std: oStd } = origCol.numericStats;
      const { mean: cMean, std: cStd } = cleanedCol.numericStats;

      // Relative mean shift > 15 %
      const denom = Math.abs(oMean) > 1e-9 ? Math.abs(oMean) : 1;
      if (Math.abs(cMean - oMean) / denom > 0.15) {
        warnings.push(
          `"${origCol.name}": mean shifted ${oMean.toFixed(2)} → ${cMean.toFixed(2)} after cleaning`
        );
      }

      // Std fell > 50 % — likely too many identical imputed values
      if (oStd > 1e-9 && (oStd - cStd) / oStd > 0.5) {
        warnings.push(
          `"${origCol.name}": variance collapsed (std ${oStd.toFixed(2)} → ${cStd.toFixed(2)}), ` +
            "possible over-imputation"
        );
      }
    }

    if (
      origCol.dtype === "categorical" &&
      origCol.topValues?.length &&
      cleanedCol.topValues?.length
    ) {
      const origTop = origCol.topValues[0].percentage;
      const cleanTop = cleanedCol.topValues[0].percentage;

      // Dominant-class frequency shifted > 20 percentage points
      if (Math.abs(cleanTop - origTop) > 20) {
        warnings.push(
          `"${origCol.name}": dominant-value share shifted ` +
            `${origTop.toFixed(1)}% → ${cleanTop.toFixed(1)}% after cleaning`
        );
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function cleanDataset(
  rows: Record<string, unknown>[],
  cleaningPlan: ColumnCleaningStep[],
  originalProfile: DataProfile
): CleanDatasetResult {
  // Shallow-copy each row — values are primitives/Dates so this is sufficient
  // and avoids mutating the caller's dataset.
  const work = rows.map((r) => ({ ...r }));

  // Original column order drives the profiler calls on both sides of the diff.
  const originalColumns = originalProfile.columns.map((c) => c.name);

  // ----- Pipeline (order is load-bearing — see inline notes) -----
  standardizeStrings(work, originalProfile);        // 1. normalise before dedup
  normalizeDates(work, originalProfile);            // 2. uniform date format
  const outliersHandled = capOutliers(work, cleaningPlan);  // 3. before impute
  const imputedColumns = imputeNulls(work, cleaningPlan);   // 4. post-cap stats
  const { remainingColumns, droppedColumns } = dropColumns( // 5. after impute
    work,
    cleaningPlan,
    originalColumns
  );
  coerceNumericColumns(work, originalProfile, remainingColumns); // 5b. string→number
  const { unique: cleanedRows, duplicatesRemoved } =         // 6. final dedup
    removeDuplicates(work);

  // ----- Re-profile the cleaned dataset -----
  const cleanedProfile = profileDataset(cleanedRows, remainingColumns);

  // ----- Build diff -----
  const diffSummary: CleaningDiff = {
    droppedColumns,
    imputedColumns,
    duplicatesRemoved,
    outliersHandled,
    distributionWarnings: detectDistributionWarnings(
      originalProfile,
      cleanedProfile,
      droppedColumns
    ),
  };

  return { cleanedRows, cleanedProfile, diffSummary };
}
