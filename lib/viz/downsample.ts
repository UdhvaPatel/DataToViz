/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling for time-series data.
 * Keeps the most visually significant points when rendering dense lines.
 *
 * Reference: Steinarsson (2013) "Downsampling Time Series for Visual Representation"
 */

export interface Point {
  [key: string]: unknown;
}

/**
 * LTTB algorithm — reduces `data` to `threshold` points while preserving
 * the visual shape of the series. Always keeps first and last point.
 *
 * @param data      Array of objects with numeric x/y values
 * @param threshold Target number of output points (must be >= 3 to be meaningful)
 * @param xKey      Key for the x value (default: "name")
 * @param yKey      Key for the y value (default: "value")
 */
export function lttb<T extends Point>(
  data: T[],
  threshold: number,
  xKey = "name",
  yKey = "value"
): T[] {
  const n = data.length;
  if (threshold >= n || threshold < 3) return data;

  const sampled: T[] = [];
  let a = 0; // previous selected index

  sampled.push(data[0]);

  const bucketSize = (n - 2) / (threshold - 2);

  for (let i = 0; i < threshold - 2; i++) {
    // Bucket range for the "next" bucket
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n - 1);

    // Average point in the next bucket (used as "C" for triangle area)
    let avgX = 0;
    let avgY = 0;
    const rangeLen = rangeEnd - rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      avgX += toNum(data[j][xKey], j);
      avgY += toNum(data[j][yKey], 0);
    }
    avgX /= rangeLen;
    avgY /= rangeLen;

    // Current bucket range
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;

    const ax = toNum(data[a][xKey], a);
    const ay = toNum(data[a][yKey], 0);

    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const bx = toNum(data[j][xKey], j);
      const by = toNum(data[j][yKey], 0);
      // Triangle area × 2 (sign doesn't matter, we want magnitude)
      const area = Math.abs((ax - avgX) * (by - ay) - (ax - bx) * (avgY - ay));
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
    a = maxIdx;
  }

  sampled.push(data[n - 1]);
  return sampled;
}

/**
 * Simple evenly-spaced downsampling — keeps every Nth point.
 * Use this for non-time-series data (e.g. scatter) where LTTB doesn't apply.
 */
export function downsampleEvenly<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = data.length / maxPoints;
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(data[Math.round(i * step)]);
  }
  return result;
}

function toNum(v: unknown, fallback: number): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}
