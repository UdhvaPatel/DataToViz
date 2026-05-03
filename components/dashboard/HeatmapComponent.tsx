"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChartCard, EmptyChart } from "./ChartCard";
import { buildHeatmapMatrix, truncate, type Row } from "./chartUtils";
import { formatColumnName } from "@/lib/viz/utils";
import { heatColor } from "@/lib/viz/colors";
import { useFilterStore } from "@/lib/viz/crossFilter";
import type { ChartRelevance } from "@/types/data";

interface HeatmapComponentProps {
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

interface TooltipState {
  x: number;
  y: number;
  xLabel: string;
  yLabel: string;
  value: number;
}

const CELL = 36;
const MARGIN_LEFT = 90;
const MARGIN_TOP = 56;
const LABEL_FONT = 11;

const fadeScale = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
};

export function HeatmapComponent({
  data,
  xAxis,
  yAxis,
  title,
  narrative,
  relevance,
  chartId,
}: HeatmapComponentProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filters = useFilterStore((s) => s.filters);
  const toggleFilter = useFilterStore((s) => s.toggleFilter);
  // Heatmap excludes both axes from cross-filter so full cross-tab is visible
  const applyFiltersExcept = useFilterStore((s) => s.applyFiltersExcept);

  const filteredData =
    xAxis && yAxis
      ? applyFiltersExcept(data, xAxis, yAxis)
      : data;

  const filterKey =
    filters.map((f) => `${f.column}:${JSON.stringify(f.values)}`).join("|") || "all";

  const selfXFilter = xAxis ? filters.find((f) => f.column === xAxis) : null;
  const selfYFilter = yAxis ? filters.find((f) => f.column === yAxis) : null;

  const isCellActive = (xVal: string, yVal: string): boolean => {
    const xOk =
      !selfXFilter || selfXFilter.values.some((v) => String(v) === xVal);
    const yOk =
      !selfYFilter || selfYFilter.values.some((v) => String(v) === yVal);
    return xOk && yOk;
  };

  if (!xAxis || !yAxis || filteredData.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message={data.length === 0 ? "No data" : "No matching rows"} />
      </ChartCard>
    );
  }

  const { xValues, yValues, matrix, min, max } = buildHeatmapMatrix(
    filteredData,
    xAxis,
    yAxis
  );

  if (xValues.length === 0 || yValues.length === 0) {
    return (
      <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
        <EmptyChart message="Insufficient categorical values" />
      </ChartCard>
    );
  }

  const svgW = MARGIN_LEFT + xValues.length * CELL + 8;
  const svgH = MARGIN_TOP + yValues.length * CELL + 8;

  const handleMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    xi: number,
    yi: number,
    value: number
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left + 12,
      y: e.clientY - rect.top - 8,
      xLabel: xValues[xi],
      yLabel: yValues[yi],
      value,
    });
  };

  return (
    <ChartCard title={title} narrative={narrative} relevance={relevance} chartId={chartId}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={filterKey} {...fadeScale}>
          <div ref={containerRef} className="relative overflow-auto">
            <svg width={svgW} height={svgH} style={{ display: "block" }}>
              {/* X-axis labels */}
              {xValues.map((xv, xi) => (
                <text
                  key={`xl-${xi}`}
                  x={MARGIN_LEFT + xi * CELL + CELL / 2}
                  y={MARGIN_TOP - 6}
                  textAnchor="end"
                  dominantBaseline="auto"
                  fontSize={LABEL_FONT}
                  fill="hsl(var(--muted-foreground))"
                  transform={`rotate(-40, ${MARGIN_LEFT + xi * CELL + CELL / 2}, ${MARGIN_TOP - 6})`}
                >
                  {truncate(formatColumnName(xv), 10)}
                </text>
              ))}

              {/* Y-axis labels */}
              {yValues.map((yv, yi) => (
                <text
                  key={`yl-${yi}`}
                  x={MARGIN_LEFT - 6}
                  y={MARGIN_TOP + yi * CELL + CELL / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={LABEL_FONT}
                  fill="hsl(var(--muted-foreground))"
                >
                  {truncate(formatColumnName(yv), 12)}
                </text>
              ))}

              {/* Cells */}
              {yValues.map((yv, yi) =>
                xValues.map((xv, xi) => {
                  const value = matrix[yi][xi];
                  const active = isCellActive(xv, yv);
                  return (
                    <rect
                      key={`${xi}-${yi}`}
                      x={MARGIN_LEFT + xi * CELL}
                      y={MARGIN_TOP + yi * CELL}
                      width={CELL - 2}
                      height={CELL - 2}
                      rx={3}
                      fill={heatColor(value, min, max)}
                      fillOpacity={active ? 1 : 0.2}
                      className="cursor-pointer"
                      onMouseEnter={(e) => handleMouseEnter(e, xi, yi, value)}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => {
                        toggleFilter(xAxis, xv);
                      }}
                    />
                  );
                })
              )}

              {/* Value labels (only for small grids) */}
              {xValues.length <= 10 &&
                yValues.length <= 10 &&
                yValues.map((_, yi) =>
                  xValues.map((_, xi) => {
                    const value = matrix[yi][xi];
                    if (value === 0) return null;
                    return (
                      <text
                        key={`lbl-${xi}-${yi}`}
                        x={MARGIN_LEFT + xi * CELL + CELL / 2 - 1}
                        y={MARGIN_TOP + yi * CELL + CELL / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={9}
                        fill="white"
                        style={{ pointerEvents: "none" }}
                      >
                        {value}
                      </text>
                    );
                  })
                )}
            </svg>

            {tooltip && (
              <div
                className="pointer-events-none absolute rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {formatColumnName(xAxis!)} × {formatColumnName(yAxis!)}
                </p>
                <p className="font-medium">
                  {tooltip.xLabel} × {tooltip.yLabel}
                </p>
                <p className="text-muted-foreground">Count: {tooltip.value}</p>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </ChartCard>
  );
}
