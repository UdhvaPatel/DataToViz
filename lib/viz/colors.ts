// ---------------------------------------------------------------------------
// 10-color accessible palette — works on both light and dark backgrounds.
// ---------------------------------------------------------------------------

export const CHART_COLORS = [
  "#818cf8", // indigo-400
  "#fb923c", // orange-400
  "#34d399", // emerald-400
  "#f472b6", // pink-400
  "#60a5fa", // blue-400
  "#facc15", // yellow-400
  "#a78bfa", // violet-400
  "#2dd4bf", // teal-400
  "#f87171", // red-400
  "#4ade80", // green-400
] as const;

export type ChartColor = (typeof CHART_COLORS)[number];

export function getColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

// ---------------------------------------------------------------------------
// Relevance badge styling
// ---------------------------------------------------------------------------

export const RELEVANCE_BADGE: Record<
  "high" | "medium" | "exploratory",
  { label: string; className: string }
> = {
  high: {
    label: "High",
    className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  },
  medium: {
    label: "Medium",
    className: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
  },
  exploratory: {
    label: "Exploratory",
    className: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/25",
  },
};

// ---------------------------------------------------------------------------
// Shared tooltip value formatter — formats numbers for display.
// Returns [formattedValue, seriesName] as expected by Recharts formatter prop.
// ---------------------------------------------------------------------------

export function tooltipFormatter(
  value: unknown,
  name: unknown
): [string, string] {
  const formatted =
    typeof value === "number"
      ? Number.isInteger(value)
        ? value.toLocaleString()
        : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(value ?? "");
  // Hide the internal "value" dataKey name for ungrouped charts
  const displayName = String(name ?? "") === "value" ? "" : String(name ?? "");
  return [formatted, displayName];
}

// ---------------------------------------------------------------------------
// Recharts theme tokens — reference CSS variables so charts respect the
// current light/dark theme without any extra logic in each component.
// ---------------------------------------------------------------------------

export const CHART_THEME = {
  grid: {
    stroke: "hsl(var(--border))",
    strokeDasharray: "3 3" as const,
  },
  axis: {
    tick: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
    axisLine: { stroke: "hsl(var(--border))" },
    tickLine: { stroke: "hsl(var(--border))" },
  },
  tooltip: {
    contentStyle: {
      backgroundColor: "hsl(var(--popover))",
      border: "1px solid hsl(var(--border))",
      borderRadius: "8px",
      color: "hsl(var(--popover-foreground))",
      fontSize: 12,
    },
    labelStyle: { color: "hsl(var(--popover-foreground))" },
    itemStyle: { color: "hsl(var(--muted-foreground))" },
  },
  legend: {
    wrapperStyle: {
      color: "hsl(var(--muted-foreground))",
      fontSize: 12,
      paddingTop: 8,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Heatmap color scale
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

export function heatColor(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : (value - min) / (max - min);
  const [r1, g1, b1] = hexToRgb("#1e293b");
  const [r2, g2, b2] = hexToRgb("#818cf8");
  return `rgb(${lerp(r1, r2, t)},${lerp(g1, g2, t)},${lerp(b1, b2, t)})`;
}
