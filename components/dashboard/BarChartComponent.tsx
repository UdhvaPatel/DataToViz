"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChartCard, EmptyChart } from "./ChartCard";
import { aggregateRows, pivotRows, toNum, truncate, type Row } from "./chartUtils";
import { getColor, CHART_THEME } from "@/lib/viz/colors";
import {
  detectBinaryEncoding,
  groupAndAggregate,
  formatColumnName,
  decodeBinaryAxis,
} from "@/lib/viz/utils";
import { useFilterStore } from "@/lib/viz/crossFilter";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import type { ChartRelevance } from "@/types/data";

const TOP_N = 15;

interface BarChartComponentProps {
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

export function BarChartComponent({
  data,
  xAxis,
  yAxis,
  groupBy,
  title,
  narrative,
  relevance,
  chartId,
}: BarChartComponentProps) {
  const filters = useFilterStore((s) => s.filters);
  const toggleFilter = useFilterStore((s) => s.toggleFilter);
  const applyFiltersExcept = useFilterStore((s) => s.applyFiltersExcept);
  const engineeredMeta = usePipelineStore((s) => s.engineeredMeta);

  const filteredData = xAxis ? applyFiltersExcept(data, xAxis) : data;

  const filterKey =
    filters.map((f) => `${f.column}:${JSON.stringify(f.values)}`).join("|") || "all";

  const selfFilter = xAxis ? filters.find((f) => f.column === xAxis) : null;
  const isActive = (name: string) =>
    !selfFilter || selfFilter.values.some((v) => String(v) === String(name));

  if (!xAxis || !yAxis || filteredData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message={data.length === 0 ? "No data" : "No matching rows"} />
      </ChartCard>
    );
  }

  const { chartData, groups, totalCount } = (() => {
    if (groupBy) {
      const { data: d, groups: g } = pivotRows(filteredData, xAxis, yAxis, groupBy);
      return { chartData: d.slice(0, TOP_N), groups: g, totalCount: d.length };
    }
    const yIsBinary = detectBinaryEncoding(filteredData.map((r) => r[yAxis])) !== null;
    const raw = yIsBinary
      ? groupAndAggregate(filteredData, xAxis, yAxis)
      : aggregateRows(filteredData, xAxis, yAxis).filter((r) => toNum(r.value) !== null);
    const total = raw.length;
    const limited =
      total > TOP_N
        ? [...raw].sort((a, b) => b.value - a.value).slice(0, TOP_N)
        : raw;
    return { chartData: limited, groups: ["value"] as string[], totalCount: total };
  })();

  if (chartData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="No plottable values found" />
      </ChartCard>
    );
  }

  // Build decode map from engineeredMeta.labelEncodings if available
  const xDecodeMap = (() => {
    const enc = engineeredMeta?.labelEncodings?.[xAxis];
    if (!enc) return undefined;
    return new Map<number, string>([[0, enc.zero], [1, enc.one]]);
  })();

  const isGrouped = groups.length > 1;
  const manyLabels = chartData.length > 8;

  const handleClick = (payload: unknown) => {
    const name = (payload as { name?: string })?.name;
    if (name !== undefined) toggleFilter(xAxis, name);
  };

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 8, bottom: manyLabels ? 20 : 40 }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid vertical={false} {...CHART_THEME.grid} />
              <XAxis
                dataKey="name"
                {...CHART_THEME.axis}
                angle={-35}
                textAnchor="end"
                interval={0}
                height={manyLabels ? 70 : 50}
                tickFormatter={(v: string) =>
                  truncate(decodeBinaryAxis(v, xAxis, xDecodeMap))
                }
                label={{
                  value: formatColumnName(xAxis),
                  position: "insideBottom",
                  offset: -10,
                  style: { fill: "hsl(var(--muted-foreground))", fontSize: 10 },
                }}
              />
              <YAxis
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
              <Tooltip
                {...CHART_THEME.tooltip}
                labelFormatter={(label) =>
                  decodeBinaryAxis(String(label), xAxis, xDecodeMap)
                }
                formatter={(value, name) => {
                  const displayValue =
                    typeof value === "number"
                      ? Number.isInteger(value)
                        ? value.toLocaleString()
                        : value.toFixed(2)
                      : String(value ?? "");
                  const dataKey = String(name ?? "");
                  const displayName =
                    dataKey === "value"
                      ? formatColumnName(yAxis)
                      : formatColumnName(dataKey);
                  return [displayValue, displayName];
                }}
              />
              {isGrouped && <Legend {...CHART_THEME.legend} />}
              {isGrouped
                ? groups.map((g, i) => (
                    <Bar
                      key={g}
                      dataKey={g}
                      fill={getColor(i)}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={40}
                      onClick={handleClick}
                    />
                  ))
                : (
                    <Bar
                      dataKey="value"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={40}
                      onClick={handleClick}
                    >
                      {chartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={getColor(i)}
                          fillOpacity={
                            isActive(String((entry as { name?: string }).name ?? ""))
                              ? 1
                              : 0.25
                          }
                        />
                      ))}
                    </Bar>
                  )}
            </BarChart>
          </ResponsiveContainer>
          {totalCount > TOP_N && (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              Showing top {TOP_N} of {totalCount} categories
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </ChartCard>
  );
}
