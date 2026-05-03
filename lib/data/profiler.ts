import type {
  DataProfile,
  ColumnProfile,
  ColumnDtype,
  DatasetType,
  ColumnAnomaly,
  NumericStats,
  CategoryFrequency,
} from "@/types/data";

// ---------------------------------------------------------------------------
// Null detection
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

// ---------------------------------------------------------------------------
// Type detection helpers
// ---------------------------------------------------------------------------

const BOOL_STRINGS = new Set([
  "true",
  "false",
  "yes",
  "no",
  "y",
  "n",
  "t",
  "f",
  "1",
  "0",
]);

function isBoolLike(v: unknown): boolean {
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return v === 0 || v === 1;
  if (typeof v === "string") return BOOL_STRINGS.has(v.trim().toLowerCase());
  return false;
}

// Matches ISO 8601, MM/DD/YYYY, DD-MM-YYYY, and common variants
const DATE_REGEXES = [
  /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?)?$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}( \d{1,2}:\d{2})?$/,
  /^\d{1,2}-\d{1,2}-\d{4}$/,
];

function isDateLike(v: unknown): boolean {
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v === "string") {
    const s = v.trim();
    if (!DATE_REGEXES.some((re) => re.test(s))) return false;
    return !Number.isNaN(Date.parse(s));
  }
  return false;
}

function isNumericLike(v: unknown): boolean {
  if (typeof v === "number") return !Number.isNaN(v);
  if (typeof v === "string") {
    // Strip leading currency symbols and thousands separators before testing
    const cleaned = v.trim().replace(/^[$£€¥₹]/, "").replace(/,/g, "");
    return cleaned !== "" && !Number.isNaN(Number(cleaned));
  }
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
// dtype detection — precedence: boolean > datetime > numeric > categorical
// ---------------------------------------------------------------------------

function detectDtype(presentValues: unknown[]): ColumnDtype {
  if (presentValues.length === 0) return "categorical";

  // Normalise for set-based unique counting
  const normalised = presentValues.map((v) =>
    typeof v === "string" ? v.trim().toLowerCase() : String(v)
  );
  const uniqueNorm = new Set(normalised);

  // Boolean: every value must be bool-like and cardinality is at most 2
  // (handles true/false, yes/no, 0/1 — but not "agree/neutral/disagree")
  if (uniqueNorm.size <= 2 && presentValues.every(isBoolLike)) {
    return "boolean";
  }

  // Count how many values look like dates vs numbers
  let dateLike = 0;
  let numericLike = 0;
  for (const v of presentValues) {
    if (isDateLike(v)) dateLike++;
    else if (isNumericLike(v)) numericLike++;
  }

  const n = presentValues.length;
  if (dateLike / n >= 0.8) return "datetime";
  if (numericLike / n >= 0.8) return "numeric";
  return "categorical";
}

// ---------------------------------------------------------------------------
// Numeric statistics
// ---------------------------------------------------------------------------

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sampleVariance(nums: number[], mu: number): number {
  if (nums.length < 2) return 0;
  return nums.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (nums.length - 1);
}

// Adjusted Fisher-Pearson G1 skewness coefficient
function skewnessG1(nums: number[], mu: number, std: number): number {
  const n = nums.length;
  if (n < 3 || std === 0) return 0;
  const m3 = nums.reduce((acc, x) => acc + ((x - mu) / std) ** 3, 0) / n;
  return (Math.sqrt(n * (n - 1)) / (n - 2)) * m3;
}

function computeNumericStats(nums: number[]): NumericStats {
  const sorted = [...nums].sort((a, b) => a - b);
  const mu = mean(nums);
  const variance = sampleVariance(nums, mu);
  const std = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: mu,
    std,
    skewness: skewnessG1(nums, mu, std),
  };
}

// ---------------------------------------------------------------------------
// Top-N categorical frequencies
// ---------------------------------------------------------------------------

function computeTopValues(
  values: string[],
  topN = 5
): CategoryFrequency[] {
  const freq = new Map<string, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  const total = values.length;
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value, count]) => ({
      value,
      count,
      percentage: (count / total) * 100,
    }));
}

// ---------------------------------------------------------------------------
// Dataset type detection
// ---------------------------------------------------------------------------

// Keywords are matched as substrings of normalised column names (lower + underscores).
// Keeping lists tight to avoid false positives.
const DATASET_SIGNALS: Record<Exclude<DatasetType, "unknown">, string[]> = {
  "time-series": [
    "date", "time", "timestamp", "datetime",
    "created_at", "updated_at", "year", "month", "day", "week",
    "hour", "period", "quarter",
  ],
  behavioral: [
    "user_id", "userid", "session", "event", "activity", "action",
    "behavior", "click", "visit", "page_view", "pageview", "interaction",
    "impression",
  ],
  transactional: [
    "amount", "price", "revenue", "cost", "payment", "order",
    "transaction", "invoice", "quantity", "total", "subtotal",
    "discount", "tax", "fee", "charge",
  ],
  survey: [
    "rating", "score", "response", "answer", "feedback",
    "satisfaction", "likert", "agree", "disagree", "question",
    "sentiment", "nps", "opinion",
  ],
};

function detectDatasetType(
  columns: string[],
  columnProfiles: Pick<ColumnProfile, "dtype">[]
): DatasetType {
  // A confirmed datetime dtype column is the strongest time-series signal
  if (columnProfiles.some((p) => p.dtype === "datetime")) return "time-series";

  const normalised = columns.map((c) =>
    c.toLowerCase().replace(/[^a-z0-9]/g, "_")
  );

  const scores: Record<Exclude<DatasetType, "unknown">, number> = {
    "time-series": 0,
    behavioral: 0,
    transactional: 0,
    survey: 0,
  };

  for (const col of normalised) {
    for (const [type, keywords] of Object.entries(DATASET_SIGNALS) as [
      Exclude<DatasetType, "unknown">,
      string[],
    ][]) {
      if (keywords.some((kw) => col.includes(kw))) scores[type]++;
    }
  }

  const [best, topScore] = (
    Object.entries(scores) as [Exclude<DatasetType, "unknown">, number][]
  ).reduce((a, b) => (b[1] > a[1] ? b : a));

  return topScore > 0 ? best : "unknown";
}

// ---------------------------------------------------------------------------
// Anomaly flags
// ---------------------------------------------------------------------------

function detectAnomalies(
  dtype: ColumnDtype,
  nullPercentage: number,
  uniqueCount: number,
  numericStats: NumericStats | undefined,
  rowCount: number
): ColumnAnomaly[] {
  const flags: ColumnAnomaly[] = [];

  if (nullPercentage > 40) {
    flags.push("high null %");
  }
  if (dtype === "numeric" && numericStats && Math.abs(numericStats.skewness) > 2) {
    flags.push("heavily skewed");
  }
  if (dtype === "numeric" && uniqueCount < 3) {
    flags.push("low variance");
  }
  if (dtype === "categorical" && rowCount > 0 && uniqueCount / rowCount > 0.5) {
    flags.push("high cardinality");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function profileDataset(
  rows: Record<string, unknown>[],
  columns: string[]
): DataProfile {
  const rowCount = rows.length;

  const columnProfiles: ColumnProfile[] = columns.map((col) => {
    const raw = rows.map((r) => r[col]);

    const nullCount = raw.filter(isNullLike).length;
    const nullPercentage = rowCount > 0 ? (nullCount / rowCount) * 100 : 0;
    const present = raw.filter((v) => !isNullLike(v));

    const dtype = detectDtype(present);

    // Count uniques on a stable string representation
    const uniqueCount = new Set(
      present.map((v) =>
        typeof v === "string" ? v.trim() : v instanceof Date ? v.toISOString() : String(v)
      )
    ).size;

    let numericStats: NumericStats | undefined;
    let topValues: CategoryFrequency[] | undefined;

    if (dtype === "numeric") {
      const nums = present.map(toFloat).filter((n): n is number => n !== null);
      if (nums.length > 0) {
        numericStats = computeNumericStats(nums);
      }
    }

    if (dtype === "categorical" || dtype === "boolean") {
      const strs = present.map((v) =>
        typeof v === "string" ? v.trim() : String(v)
      );
      topValues = computeTopValues(strs);
    }

    const anomalies = detectAnomalies(
      dtype,
      nullPercentage,
      uniqueCount,
      numericStats,
      rowCount
    );

    return {
      name: col,
      dtype,
      nullCount,
      nullPercentage,
      uniqueCount,
      anomalies,
      ...(numericStats !== undefined && { numericStats }),
      ...(topValues !== undefined && { topValues }),
    };
  });

  return {
    rowCount,
    columnCount: columns.length,
    datasetType: detectDatasetType(columns, columnProfiles),
    columns: columnProfiles,
  };
}
