"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartCard, EmptyChart } from "./ChartCard";
import { toNum, toStr, type Row } from "./chartUtils";
import { getColor, CHART_THEME } from "@/lib/viz/colors";
import { formatColumnName } from "@/lib/viz/utils";
import { useFilterStore } from "@/lib/viz/crossFilter";
import type { ChartRelevance } from "@/types/data";

interface BubbleChartComponentProps {
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

export function BubbleChartComponent({
  data,
  xAxis,
  yAxis,
  groupBy,
  colorBy,
  title,
  narrative,
  relevance,
  chartId,
}: BubbleChartComponentProps) {
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

  const grouped = new Map<string, { x: number; y: number; z: number }[]>();
  for (const row of filteredData) {
    const x = toNum(row[xAxis]);
    const y = toNum(row[yAxis]);
    if (x === null || y === null) continue;
    const z = groupBy ? (toNum(row[groupBy]) ?? 1) : 1;
    const group = colorBy ? toStr(row[colorBy] ?? "All") : "All";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push({ x, y, z: Math.abs(z) });
  }

  const seriesNames = [...grouped.keys()].slice(0, 8);

  if (seriesNames.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="No numeric values found" />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid {...CHART_THEME.grid} />
              <XAxis
                dataKey="x"
                type="number"
                name={xAxis}
                {...CHART_THEME.axis}
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
                width={52}
                label={{
                  value: formatColumnName(yAxis),
                  angle: -90,
                  position: "insideLeft",
                  dy: -10,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <ZAxis dataKey="z" type="number" name={groupBy ?? "size"} range={[30, 600]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                {...CHART_THEME.tooltip}
                formatter={(value, name) => {
                  const displayValue =
                    typeof value === "number"
                      ? Number.isInteger(value)
                        ? value.toLocaleString()
                        : value.toFixed(2)
                      : String(value ?? "");
                  return [displayValue, formatColumnName(String(name ?? ""))];
                }}
              />
              {seriesNames.length > 1 && <Legend {...CHART_THEME.legend} />}
              {seriesNames.map((name, i) => (
                <Scatter
                  key={name}
                  name={name}
                  data={grouped.get(name)!}
                  fill={getColor(i)}
                  fillOpacity={isSeriesActive(name) ? 0.65 : 0.15}
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
