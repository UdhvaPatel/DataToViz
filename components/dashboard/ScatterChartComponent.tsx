"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartCard, EmptyChart } from "./ChartCard";
import { toNum, toStr, type Row } from "./chartUtils";
import { getColor, CHART_THEME } from "@/lib/viz/colors";
import { downsampleEvenly } from "@/lib/viz/downsample";
import { detectBinaryEncoding, formatColumnName, type BinaryEncoding } from "@/lib/viz/utils";
import { useFilterStore } from "@/lib/viz/crossFilter";
import type { ChartRelevance } from "@/types/data";

interface ScatterChartComponentProps {
  data: Row[];
  xAxis: string | null;
  yAxis: string | null;
  groupBy: string | null;
  colorBy: string | null;
  title: string;
  narrative: string;
  relevance: ChartRelevance;
  chartId?: string;
}

const fadeScale = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
};

// Encode a single value using toNum first, then a binary map fallback.
function encodeValue(v: unknown, binary: BinaryEncoding | null): number | null {
  const n = toNum(v);
  if (n !== null) return n;
  if (binary && typeof v === "string") {
    const encoded = binary.encode.get(v.trim());
    return encoded !== undefined ? encoded : null;
  }
  return null;
}

// Tooltip formatter that shows original labels for binary-encoded axes.
function makeFormatter(
  xName: string,
  yName: string,
  xBinary: BinaryEncoding | null,
  yBinary: BinaryEncoding | null
) {
  return (value: unknown, name: unknown): [string, string] => {
    const axisName = String(name ?? "");
    const displayName = formatColumnName(axisName);
    const displayValue =
      typeof value === "number"
        ? Number.isInteger(value)
          ? value.toLocaleString()
          : value.toFixed(2)
        : String(value ?? "");

    if (typeof value === "number") {
      if (axisName === xName && xBinary?.decode.has(value)) {
        return [xBinary.decode.get(value)!, displayName];
      }
      if (axisName === yName && yBinary?.decode.has(value)) {
        return [yBinary.decode.get(value)!, displayName];
      }
    }
    return [displayValue, displayName];
  };
}

export function ScatterChartComponent({
  data,
  xAxis,
  yAxis,
  colorBy,
  title,
  narrative,
  relevance,
  chartId,
}: ScatterChartComponentProps) {
  const filters = useFilterStore((s) => s.filters);
  const toggleFilter = useFilterStore((s) => s.toggleFilter);
  const applyFiltersExcept = useFilterStore((s) => s.applyFiltersExcept);

  const filteredData = colorBy ? applyFiltersExcept(data, colorBy) : data;

  const filterKey =
    filters.map((f) => `${f.column}:${JSON.stringify(f.values)}`).join("|") || "all";

  const selfFilter = colorBy ? filters.find((f) => f.column === colorBy) : null;
  const isSeriesActive = (name: string) =>
    !selfFilter || selfFilter.values.some((v) => String(v) === String(name));

  if (!xAxis || !yAxis || filteredData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message={data.length === 0 ? "No data" : "No matching rows"} />
      </ChartCard>
    );
  }

  // Detect binary string columns (e.g. "Yes"/"No") so they can be encoded 0/1.
  const xBinary = detectBinaryEncoding(filteredData.map((r) => r[xAxis]));
  const yBinary = detectBinaryEncoding(filteredData.map((r) => r[yAxis]));

  // Group by colorBy; all data goes into a single "All" series when colorBy is null
  const grouped = new Map<string, { x: number; y: number }[]>();
  for (const row of filteredData) {
    const x = encodeValue(row[xAxis], xBinary);
    const y = encodeValue(row[yAxis], yBinary);
    if (x === null || y === null) continue;
    const group = colorBy ? toStr(row[colorBy] ?? "All") : "All";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push({ x, y });
  }

  const seriesNames = [...grouped.keys()].slice(0, 8);
  // Cap each series at 300 points to keep rendering fast
  for (const [key, pts] of grouped) {
    if (pts.length > 300) grouped.set(key, downsampleEvenly(pts, 300));
  }

  if (seriesNames.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="No numeric values found" />
      </ChartCard>
    );
  }

  const tooltipFmt = makeFormatter(xAxis, yAxis, xBinary, yBinary);

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 4, right: 16, left: 60, bottom: 4 }}>
              <CartesianGrid {...CHART_THEME.grid} />
              <XAxis
                dataKey="x"
                type="number"
                name={xAxis}
                {...CHART_THEME.axis}
                ticks={xBinary ? [0, 1] : undefined}
                domain={xBinary ? [-0.5, 1.5] : undefined}
                tickFormatter={
                  xBinary ? (v: number) => xBinary.decode.get(v) ?? String(v) : undefined
                }
                label={{
                  value: formatColumnName(xAxis),
                  position: "insideBottom",
                  offset: -8,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <YAxis
                dataKey="y"
                type="number"
                name={yAxis}
                {...CHART_THEME.axis}
                width={48}
                ticks={yBinary ? [0, 1] : undefined}
                domain={yBinary ? [-0.5, 1.5] : undefined}
                tickFormatter={
                  yBinary ? (v: number) => yBinary.decode.get(v) ?? String(v) : undefined
                }
                label={{
                  value: formatColumnName(yAxis),
                  angle: -90,
                  position: "insideLeft",
                  dx: -40,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                {...CHART_THEME.tooltip}
                formatter={tooltipFmt}
              />
              {seriesNames.length > 1 && <Legend {...CHART_THEME.legend} />}
              {seriesNames.map((name, i) => (
                <Scatter
                  key={name}
                  name={name}
                  data={grouped.get(name)!}
                  fill={getColor(i)}
                  fillOpacity={isSeriesActive(name) ? 0.7 : 0.15}
                  style={{ cursor: colorBy ? "pointer" : "default" }}
                  onClick={() => {
                    if (colorBy) toggleFilter(colorBy, name);
                  }}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </ChartCard>
  );
}
