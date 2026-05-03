"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  X,
  FilterX,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import { useFilterStore, isRangeFilter } from "@/lib/viz/crossFilter";
import type { ColumnDistribution, ColumnDtype } from "@/types/data";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ColConfig {
  column: string;
  type: "categorical" | "numeric" | "datetime";
  uniqueValues?: string[];
  min?: number;
  max?: number;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string;
}

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(/[$£€¥₹,]/g, ""));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function buildConfig(
  column: string,
  dtype: ColumnDtype | undefined,
  dist: ColumnDistribution | undefined,
  rows: Row[]
): ColConfig {
  // dtype from DataProfile is the authoritative discriminant — it supersedes
  // whatever EDA classified, which can misclassify numeric columns as datetime
  // when they contain year-like integers.
  if (dtype === "numeric") {
    if (dist?.type === "numeric") {
      return { column, type: "numeric", min: dist.min, max: dist.max };
    }
    const nums = rows
      .map((r) => toNum(r[column]))
      .filter((v): v is number => v !== null);
    const min = nums.length ? nums.reduce((a, b) => (b < a ? b : a)) : 0;
    const max = nums.length ? nums.reduce((a, b) => (b > a ? b : a)) : 1;
    return { column, type: "numeric", min, max };
  }

  if (dtype === "datetime") {
    const minDate = dist?.type === "datetime" ? dist.min.slice(0, 10) : "";
    const maxDate = dist?.type === "datetime" ? dist.max.slice(0, 10) : "";
    return { column, type: "datetime", minDate, maxDate };
  }

  if (dtype === "categorical" || dtype === "boolean") {
    const uniqueValues =
      dist?.type === "categorical" || dist?.type === "boolean"
        ? dist.values.map((v) => v.value).slice(0, 50)
        : [...new Set(rows.map((r) => String(r[column] ?? "")).filter(Boolean))].slice(0, 50);
    return { column, type: "categorical", uniqueValues };
  }

  // No dtype available — fall back to heuristic inference
  if (!dist) {
    const vals = rows.map((r) => r[column]).filter((v) => v != null);
    const numCount = vals.filter((v) => toNum(v) !== null).length;
    if (vals.length > 0 && numCount / vals.length >= 0.8) {
      const nums = vals.map((v) => toNum(v)).filter((v): v is number => v !== null);
      const min = nums.reduce((a, b) => (b < a ? b : a), nums[0]);
      const max = nums.reduce((a, b) => (b > a ? b : a), nums[0]);
      return { column, type: "numeric", min, max };
    }
    const unique = [...new Set(vals.map((v) => String(v)))].slice(0, 50);
    return { column, type: "categorical", uniqueValues: unique };
  }

  if (dist.type === "numeric") return { column, type: "numeric", min: dist.min, max: dist.max };
  if (dist.type === "datetime") {
    return { column, type: "datetime", minDate: dist.min.slice(0, 10), maxDate: dist.max.slice(0, 10) };
  }
  return { column, type: "categorical", uniqueValues: dist.values.map((v) => v.value).slice(0, 50) };
}

function niceStep(min: number, max: number): number {
  const raw = (max - min) / 100;
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return Math.max(mag, 0.01);
}

function fmtNum(v: number, step: number): string {
  return step < 1 ? v.toFixed(2) : Math.round(v).toLocaleString();
}

// ---------------------------------------------------------------------------
// Animated section wrapper (slide-down / collapse)
// ---------------------------------------------------------------------------

function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      style={{ overflow: "hidden" }}
      // On md+ screens always show, overriding framer-motion inline height
      className="md:!h-auto md:!opacity-100 md:!overflow-visible"
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CategoricalFilter — multi-select dropdown with search + chips
// ---------------------------------------------------------------------------

function CategoricalFilter({
  config,
  selected,
  onChange,
}: {
  config: ColConfig;
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const all = config.uniqueValues ?? [];
  const visible = search
    ? all.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
    : all;

  const toggle = useCallback(
    (v: string) => {
      onChange(
        selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]
      );
    },
    [selected, onChange]
  );

  const label =
    selected.length === 0
      ? "Select values…"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm transition-colors hover:bg-accent/50 focus:outline-none",
          selected.length > 0 ? "border-primary/40" : "border-input"
        )}
      >
        <span className="truncate text-left text-muted-foreground">{label}</span>
        {open ? (
          <ChevronUp className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        ) : (
          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
      </button>

      {/* Selected chips */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.12 }}
            className="mt-1.5 flex flex-wrap gap-1"
          >
            {selected.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {v.length > 16 ? v.slice(0, 16) + "…" : v}
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  className="rounded-full p-0.5 hover:bg-primary/25"
                >
                  <X className="h-2 w-2" />
                </button>
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
          >
            {all.length > 8 && (
              <div className="border-b border-border px-3 py-1.5">
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
            )}
            <ul className="max-h-52 overflow-y-auto py-1">
              {visible.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">No matches</li>
              ) : (
                visible.map((v) => (
                  <li key={v}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={selected.includes(v)}
                        onChange={() => toggle(v)}
                        className="accent-primary"
                      />
                      <span className="truncate text-sm">{v}</span>
                    </label>
                  </li>
                ))
              )}
            </ul>
            {selected.length > 0 && (
              <div className="border-t border-border px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onChange([]);
                    setOpen(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NumericFilter — dual range slider (min + max inputs)
// ---------------------------------------------------------------------------

function NumericFilter({
  config,
  currentRange,
  onCommit,
}: {
  config: ColConfig;
  currentRange: [number, number] | null;
  onCommit: (range: [number, number] | null) => void;
}) {
  const gMin = config.min ?? 0;
  const gMax = config.max ?? 1;
  const step = niceStep(gMin, gMax);

  const [local, setLocal] = useState<[number, number]>(
    currentRange ?? [gMin, gMax]
  );

  // Reset when external filter cleared
  useEffect(() => {
    if (currentRange === null) setLocal([gMin, gMax]);
  }, [currentRange, gMin, gMax]);

  const isDefault =
    Math.abs(local[0] - gMin) < step && Math.abs(local[1] - gMax) < step;

  const commit = useCallback(() => {
    onCommit(isDefault ? null : [local[0], local[1]]);
  }, [isDefault, local, onCommit]);

  return (
    <div className="space-y-2">
      {/* Current range display */}
      <div className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <span>{fmtNum(local[0], step)}</span>
        <span className="text-[10px] opacity-50">to</span>
        <span>{fmtNum(local[1], step)}</span>
      </div>

      {/* Min slider */}
      <div className="flex items-center gap-2">
        <span className="w-6 text-[10px] text-muted-foreground">Min</span>
        <input
          type="range"
          min={gMin}
          max={gMax}
          step={step}
          value={local[0]}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), local[1] - step);
            setLocal([v, local[1]]);
          }}
          onMouseUp={commit}
          onTouchEnd={commit}
          className="h-1.5 w-full cursor-pointer accent-primary"
        />
      </div>

      {/* Max slider */}
      <div className="flex items-center gap-2">
        <span className="w-6 text-[10px] text-muted-foreground">Max</span>
        <input
          type="range"
          min={gMin}
          max={gMax}
          step={step}
          value={local[1]}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), local[0] + step);
            setLocal([local[0], v]);
          }}
          onMouseUp={commit}
          onTouchEnd={commit}
          className="h-1.5 w-full cursor-pointer accent-primary"
        />
      </div>

      <AnimatePresence>
        {!isDefault && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => {
              setLocal([gMin, gMax]);
              onCommit(null);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Reset range
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DatetimeFilter — two native date inputs
// ---------------------------------------------------------------------------

function DatetimeFilter({
  config,
  currentRange,
  onCommit,
}: {
  config: ColConfig;
  currentRange: [string, string] | null;
  onCommit: (range: [string, string] | null) => void;
}) {
  const absMin = config.minDate ?? "";
  const absMax = config.maxDate ?? "";

  const [from, setFrom] = useState(currentRange?.[0] ?? "");
  const [to, setTo] = useState(currentRange?.[1] ?? "");

  useEffect(() => {
    if (currentRange === null) {
      setFrom("");
      setTo("");
    }
  }, [currentRange]);

  const commit = (f: string, t: string) => {
    if (!f && !t) {
      onCommit(null);
    } else {
      onCommit([f || absMin, t || absMax]);
    }
  };

  const hasValue = Boolean(from || to);

  return (
    <div className="space-y-2">
      <div className="w-full overflow-hidden space-y-2">
        <div>
          <label className="mb-1 block text-[10px] text-muted-foreground">From</label>
          <input
            type="date"
            min={absMin}
            max={to || absMax}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              commit(e.target.value, to);
            }}
            className="w-full rounded bg-background border border-border p-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-muted-foreground">To</label>
          <input
            type="date"
            min={from || absMin}
            max={absMax}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              commit(from, e.target.value);
            }}
            className="w-full rounded bg-background border border-border p-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]"
          />
        </div>
      </div>

      <AnimatePresence>
        {hasValue && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => {
              setFrom("");
              setTo("");
              onCommit(null);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear dates
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterItem — collapsible wrapper for a single column filter
// ---------------------------------------------------------------------------

function FilterItem({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="text-xs font-medium leading-none text-foreground">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <AnimatePresence>
            {active && (
              <motion.span
                key="dot"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.12 }}
                className="h-1.5 w-1.5 rounded-full bg-primary"
              />
            )}
          </AnimatePresence>
          {open ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </button>

      <Collapse open={open}>
        <div className="mt-3">{children}</div>
      </Collapse>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterPanel (main export)
// ---------------------------------------------------------------------------

export function FilterPanel() {
  const [panelOpen, setPanelOpen] = useState(true);

  // Pipeline data
  const selectedColumns = usePipelineStore(
    (s) => s.engineeredMeta?.selectedColumns ?? []
  );
  const distributions = usePipelineStore(
    (s) => s.edaResult?.distributions ?? {}
  );
  const rows = usePipelineStore((s) => s.vizReadyRows ?? []);
  const dataProfile = usePipelineStore((s) => s.dataProfile);

  // Filter store
  const filters = useFilterStore((s) => s.filters);
  const addFilter = useFilterStore((s) => s.addFilter);
  const removeFilter = useFilterStore((s) => s.removeFilter);
  const clearAllFilters = useFilterStore((s) => s.clearAllFilters);

  const activeCount = filters.length;

  // Build per-column config once, using DataProfile dtype as the primary
  // type discriminant so numeric columns are never misclassified as datetime.
  const dtypeMap = useMemo(() => {
    const map = new Map<string, ColumnDtype>();
    for (const col of dataProfile?.columns ?? []) map.set(col.name, col.dtype);
    return map;
  }, [dataProfile]);

  const configs = useMemo(
    () =>
      selectedColumns.map((col) =>
        buildConfig(col, dtypeMap.get(col), distributions[col], rows)
      ),
    [selectedColumns, dtypeMap, distributions, rows]
  );

  // ── Accessors for current filter values ──────────────────────────────────

  const getCategorical = (col: string): string[] => {
    const f = filters.find((f) => f.column === col);
    return (f?.values ?? []).filter(
      (v): v is string => typeof v === "string"
    );
  };

  const getNumericRange = (col: string): [number, number] | null => {
    const f = filters.find((f) => f.column === col);
    if (!f) return null;
    const rv = f.values[0];
    if (rv && isRangeFilter(rv) && typeof rv.min === "number") {
      return [rv.min as number, rv.max as number];
    }
    return null;
  };

  const getDateRange = (col: string): [string, string] | null => {
    const f = filters.find((f) => f.column === col);
    if (!f) return null;
    const rv = f.values[0];
    if (rv && isRangeFilter(rv) && typeof rv.min === "string") {
      return [rv.min as string, rv.max as string];
    }
    return null;
  };

  if (configs.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filters</span>

          {/* Active filter count badge */}
          <AnimatePresence>
            {activeCount > 0 && (
              <motion.span
                key="count"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15, type: "spring", stiffness: 300 }}
                className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground"
              >
                {activeCount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1">
          {/* Clear All — only when filters are active */}
          <AnimatePresence>
            {activeCount > 0 && (
              <motion.button
                key="clear"
                type="button"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={{ duration: 0.15 }}
                onClick={clearAllFilters}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <FilterX className="h-3 w-3" />
                Clear all
              </motion.button>
            )}
          </AnimatePresence>

          {/* Mobile collapse toggle */}
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent md:hidden"
            aria-label={panelOpen ? "Collapse filters" : "Expand filters"}
          >
            {panelOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* ── Filter body ──────────────────────────────────────────────────── */}
      <Collapse open={panelOpen}>
        <div className="max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto border-t border-border px-3 pb-3 pt-2">
          {configs.map((cfg) => {
            const isActive = filters.some((f) => f.column === cfg.column);

            return (
              <FilterItem key={cfg.column} label={cfg.column} active={isActive}>
                {cfg.type === "categorical" && (
                  <CategoricalFilter
                    config={cfg}
                    selected={getCategorical(cfg.column)}
                    onChange={(vals) => {
                      if (vals.length === 0) removeFilter(cfg.column);
                      else addFilter(cfg.column, vals);
                    }}
                  />
                )}

                {cfg.type === "numeric" && (
                  <NumericFilter
                    config={cfg}
                    currentRange={getNumericRange(cfg.column)}
                    onCommit={(range) => {
                      if (range === null) removeFilter(cfg.column);
                      else
                        addFilter(cfg.column, [{ min: range[0], max: range[1] }]);
                    }}
                  />
                )}

                {cfg.type === "datetime" && (
                  <DatetimeFilter
                    config={cfg}
                    currentRange={getDateRange(cfg.column)}
                    onCommit={(range) => {
                      if (range === null) removeFilter(cfg.column);
                      else addFilter(cfg.column, [{ min: range[0], max: range[1] }]);
                    }}
                  />
                )}
              </FilterItem>
            );
          })}
        </div>
      </Collapse>
    </div>
  );
}
