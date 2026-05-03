export function coerceToNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[$£€¥₹,]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// Maps "Yes" → 1, "No" → 0 (and common equivalents).
export function encodeChurnAxis(value: string): number {
  const v = value.trim().toLowerCase();
  return v === "yes" || v === "true" || v === "on" || v === "1" ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Binary-column detection
//
// Returns encode/decode maps when a column contains exactly 2 distinct
// non-numeric string values.  Well-known pairs (yes/no, true/false, …) get
// a stable polarity; unknown pairs fall back to alphabetical order (0 / 1).
// ---------------------------------------------------------------------------

// [negative-word, positive-word] — all lowercase
const KNOWN_BINARY_PAIRS: [string, string][] = [
  ["no", "yes"],
  ["false", "true"],
  ["off", "on"],
  ["inactive", "active"],
  ["closed", "open"],
  ["absent", "present"],
  ["lost", "won"],
  ["fail", "pass"],
  ["n", "y"],
  ["f", "t"],
];

export interface BinaryEncoding {
  encode: Map<string, number>; // original string → 0 | 1
  decode: Map<number, string>; // 0 | 1 → original string
}

// ---------------------------------------------------------------------------
// groupAndAggregate
//
// Groups rows by xKey and computes the mean of yKey per group.  Binary string
// columns (e.g. "Yes"/"No") are encoded to 0/1 before averaging, so the
// result is a rate (e.g. 0.62 = 62 % churn rate).
// ---------------------------------------------------------------------------

export function groupAndAggregate(
  rows: Record<string, unknown>[],
  xKey: string,
  yKey: string
): { name: string; value: number; count: number }[] {
  const yValues = rows.map((r) => r[yKey]);
  const binary = detectBinaryEncoding(yValues);

  const acc = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    if (row[xKey] == null) continue;
    const name = String(row[xKey]);

    let val: number | null;
    if (binary && typeof row[yKey] === "string") {
      const encoded = binary.encode.get((row[yKey] as string).trim());
      val = encoded !== undefined ? encoded : null;
    } else {
      val = coerceToNumber(row[yKey]);
    }
    if (val === null) continue;

    const entry = acc.get(name) ?? { sum: 0, count: 0 };
    acc.set(name, { sum: entry.sum + val, count: entry.count + 1 });
  }

  return [...acc.entries()].map(([name, { sum, count }]) => ({
    name,
    value: count > 0 ? sum / count : 0,
    count,
  }));
}

// ---------------------------------------------------------------------------
// Column name formatter
//
// Converts raw column names (snake_case) into human-readable titles.
// Well-known names get explicit overrides; all others get underscores-to-spaces
// and title-case applied.
// ---------------------------------------------------------------------------

const COLUMN_NAME_OVERRIDES: Record<string, string> = {
  is_peak_hour: "Peak Hour",
  energy_consumption: "Energy Consumption",
  renewable_energy: "Renewable Energy",
  square_footage: "Square Footage",
};

export function formatColumnName(col: string): string {
  if (!col) return col;
  if (COLUMN_NAME_OVERRIDES[col]) return COLUMN_NAME_OVERRIDES[col];
  return col
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Date axis formatter
//
// Abbreviates date strings for axis tick labels based on the span of the data.
// ---------------------------------------------------------------------------

export function formatAxisDate(value: string, rangeSpanDays: number): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  if (rangeSpanDays > 60) {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  if (rangeSpanDays >= 7) {
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  }
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart}`;
}

// ---------------------------------------------------------------------------
// Binary axis decoder
//
// Reverses 0/1 numeric encoding back to readable category labels.
// Resolution order: explicit decode map → column-name pattern → raw value.
// ---------------------------------------------------------------------------

export function decodeBinaryAxis(
  value: number | string,
  columnName: string,
  decodingMap?: Map<number, string>
): string {
  const numVal = typeof value === "string" ? Number(value) : value;
  if (numVal !== 0 && numVal !== 1) return String(value);

  // Use explicit decode map first (populated from engineeredMeta.labelEncodings)
  if (decodingMap?.has(numVal)) return decodingMap.get(numVal)!;

  const lower = columnName.toLowerCase();

  if (lower === "is_peak_hour") return numVal === 0 ? "Non-Peak" : "Peak";
  if (lower.includes("peak")) return numVal === 0 ? "Non-Peak" : "Peak";
  if (lower.includes("is_") || lower.includes("has_") || lower.includes("flag")) {
    return numVal === 0 ? "No" : "Yes";
  }

  return String(value);
}

export function detectBinaryEncoding(values: unknown[]): BinaryEncoding | null {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonNull.length === 0) return null;

  // All values must be strings (not already numbers)
  if (!nonNull.every((v) => typeof v === "string")) return null;

  const unique = [...new Set((nonNull as string[]).map((v) => v.trim()))];
  if (unique.length !== 2) return null;

  // If both parse as plain numbers, let the normal numeric path handle it
  if (unique.every((v) => !Number.isNaN(Number(v)))) return null;

  const lower = unique.map((v) => v.toLowerCase()).sort() as [string, string];
  const knownPair = KNOWN_BINARY_PAIRS.find(([neg, pos]) => neg === lower[0] && pos === lower[1]);

  let zero: string;
  let one: string;

  if (knownPair) {
    const [negLower] = knownPair;
    zero = unique.find((v) => v.toLowerCase() === negLower)!;
    one = unique.find((v) => v.toLowerCase() !== negLower)!;
  } else {
    // Alphabetical: first sorted = 0, second = 1
    const sorted = [...unique].sort();
    zero = sorted[0];
    one = sorted[1];
  }

  return {
    encode: new Map([[zero, 0], [one, 1]]),
    decode: new Map([[0, zero], [1, one]]),
  };
}
