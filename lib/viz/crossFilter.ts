import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Categorical filter: values is an array of stringifiable values. */
export interface ActiveFilter {
  column: string;
  values: unknown[];
}

/**
 * Range filter stored inside values[].
 * min/max are numbers for numeric columns and ISO date strings for datetime
 * columns ("2020-01-01" / "2023-12-31").
 */
export interface RangeFilter {
  min: number | string;
  max: number | string;
}

export function isRangeFilter(v: unknown): v is RangeFilter {
  return (
    typeof v === "object" &&
    v !== null &&
    "min" in v &&
    "max" in v
  );
}

// ---------------------------------------------------------------------------
// Value matching — handles both categorical and range filter values
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

export function matchValue(rowVal: unknown, filterVal: unknown): boolean {
  if (isRangeFilter(filterVal)) {
    // String range (ISO dates): "2020-01-01" ≤ rowVal ≤ "2023-12-31"
    if (typeof filterVal.min === "string" && typeof filterVal.max === "string") {
      const rv = typeof rowVal === "string" ? rowVal.slice(0, 10) : "";
      return rv >= filterVal.min && rv <= filterVal.max;
    }
    // Numeric range
    const n = toNum(rowVal);
    if (n !== null) {
      return n >= (filterVal.min as number) && n <= (filterVal.max as number);
    }
    // Datetime string stored as ISO → compare via timestamp
    if (typeof rowVal === "string") {
      const ms = Date.parse(rowVal);
      if (!Number.isNaN(ms)) {
        return ms >= (filterVal.min as number) && ms <= (filterVal.max as number);
      }
    }
    return false;
  }
  // Categorical: normalised string comparison
  const rv = rowVal === null || rowVal === undefined ? "" : String(rowVal);
  const fv = filterVal === null || filterVal === undefined ? "" : String(filterVal);
  return rv === fv;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface FilterStore {
  filters: ActiveFilter[];

  /** Replace (or create) the filter for a column with the given values. */
  addFilter: (column: string, values: unknown[]) => void;

  /** Remove the filter for a column entirely. */
  removeFilter: (column: string) => void;

  /** Remove all active filters. */
  clearAllFilters: () => void;

  /**
   * Toggle a single value inside the filter for a column.
   * Adds the value if absent; removes it if present.
   * Automatically calls removeFilter when the last value is deselected.
   */
  toggleFilter: (column: string, value: unknown) => void;

  /**
   * Apply all active filters to a row set.
   * Rows must satisfy ALL column filters (AND semantics); each column filter
   * is satisfied when the row matches ANY of its values (OR semantics).
   */
  applyFilters: (rows: Row[]) => Row[];

  /**
   * Like applyFilters, but skips the filter(s) for the excluded column(s).
   * Used by each chart to apply cross-filters from *other* charts while
   * still showing all of its own data for the column it owns.
   */
  applyFiltersExcept: (rows: Row[], ...excludeColumns: string[]) => Row[];

  /**
   * Returns true when the given value is currently selected in the filter
   * for the given column.  Used for visual dimming in chart components.
   */
  isFiltered: (column: string, value: unknown) => boolean;

  /** True when at least one filter is active. */
  hasFilters: boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFilterStore = create<FilterStore>((set, get) => ({
  filters: [],
  hasFilters: false,

  addFilter: (column, values) =>
    set((state) => {
      const idx = state.filters.findIndex((f) => f.column === column);
      const next =
        idx >= 0
          ? state.filters.map((f, i) => (i === idx ? { column, values } : f))
          : [...state.filters, { column, values }];
      return { filters: next, hasFilters: next.length > 0 };
    }),

  removeFilter: (column) =>
    set((state) => {
      const next = state.filters.filter((f) => f.column !== column);
      return { filters: next, hasFilters: next.length > 0 };
    }),

  clearAllFilters: () => set({ filters: [], hasFilters: false }),

  toggleFilter: (column, value) =>
    set((state) => {
      const existing = state.filters.find((f) => f.column === column);

      if (!existing) {
        const next = [...state.filters, { column, values: [value] }];
        return { filters: next, hasFilters: true };
      }

      const alreadyIn = existing.values.some((v) => matchValue(value, v));
      const newValues = alreadyIn
        ? existing.values.filter((v) => !matchValue(value, v))
        : [...existing.values, value];

      if (newValues.length === 0) {
        const next = state.filters.filter((f) => f.column !== column);
        return { filters: next, hasFilters: next.length > 0 };
      }

      const next = state.filters.map((f) =>
        f.column === column ? { ...f, values: newValues } : f
      );
      return { filters: next, hasFilters: true };
    }),

  applyFilters: (rows) => {
    const { filters } = get();
    if (filters.length === 0) return rows;
    return rows.filter((row) =>
      filters.every((f) => f.values.some((fv) => matchValue(row[f.column], fv)))
    );
  },

  applyFiltersExcept: (rows, ...excludeColumns) => {
    const { filters } = get();
    const excluded = new Set(excludeColumns);
    const applicable = filters.filter((f) => !excluded.has(f.column));
    if (applicable.length === 0) return rows;
    return rows.filter((row) =>
      applicable.every((f) => f.values.some((fv) => matchValue(row[f.column], fv)))
    );
  },

  isFiltered: (column, value) => {
    const { filters } = get();
    const f = filters.find((f) => f.column === column);
    if (!f || f.values.length === 0) return false;
    return f.values.some((v) => matchValue(value, v));
  },
}));

// ---------------------------------------------------------------------------
// Non-React convenience wrappers (for use in pipeline.ts, server actions, etc.)
// ---------------------------------------------------------------------------

export function applyFilters(rows: Row[]): Row[] {
  return useFilterStore.getState().applyFilters(rows);
}

export function addFilter(column: string, values: unknown[]): void {
  useFilterStore.getState().addFilter(column, values);
}

export function removeFilter(column: string): void {
  useFilterStore.getState().removeFilter(column);
}

export function clearAllFilters(): void {
  useFilterStore.getState().clearAllFilters();
}
