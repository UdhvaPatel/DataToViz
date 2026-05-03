// ---------------------------------------------------------------------------
// Column-level types
// ---------------------------------------------------------------------------

export type ColumnDtype = "numeric" | "categorical" | "datetime" | "boolean";

export type ColumnAnomaly =
  | "high null %"
  | "heavily skewed"
  | "low variance"
  | "high cardinality";

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  skewness: number;
}

export interface CategoryFrequency {
  value: string;
  count: number;
  /** Percentage of non-null values in this column */
  percentage: number;
}

export interface ColumnProfile {
  name: string;
  dtype: ColumnDtype;
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  anomalies: ColumnAnomaly[];
  numericStats?: NumericStats;
  topValues?: CategoryFrequency[];
}

// ---------------------------------------------------------------------------
// Dataset-level types
// ---------------------------------------------------------------------------

export type DatasetType =
  | "time-series"
  | "behavioral"
  | "transactional"
  | "survey"
  | "unknown";

export interface DataProfile {
  rowCount: number;
  columnCount: number;
  datasetType: DatasetType;
  columns: ColumnProfile[];
}

export interface ContextPackage {
  sampledRows: Record<string, unknown>[];
  profileSummary: string;
  anomalyFlags: string[];
  datasetType: string;
}

// ---------------------------------------------------------------------------
// LLM understanding — output of the first Groq call
// ---------------------------------------------------------------------------

export type ColumnRole = "target" | "feature" | "identifier" | "irrelevant";

export type CleaningAction =
  | "drop"
  | "impute_mean"
  | "impute_median"
  | "impute_mode"
  | "impute_placeholder"
  | "cap_outliers"
  | "keep";

export interface ColumnRoleAssignment {
  columnName: string;
  semanticMeaning: string;
  role: ColumnRole;
  suggestedAction: string;
}

export interface ColumnCleaningStep {
  columnName: string;
  action: CleaningAction;
  reason: string;
}

export interface DataUnderstanding {
  datasetType: string;
  columnRoles: ColumnRoleAssignment[];
  cleaningPlan: ColumnCleaningStep[];
}

// ---------------------------------------------------------------------------
// Cleaning diff — output of the local cleaner
// ---------------------------------------------------------------------------

export interface ImputedColumn {
  column: string;
  strategy: string;
  count: number;
}

export interface OutlierHandled {
  column: string;
  count: number;
}

export interface CleaningDiff {
  droppedColumns: string[];
  imputedColumns: ImputedColumn[];
  duplicatesRemoved: number;
  outliersHandled: OutlierHandled[];
  distributionWarnings: string[];
}

export interface CleanDatasetResult {
  cleanedRows: Record<string, unknown>[];
  cleanedProfile: DataProfile;
  diffSummary: CleaningDiff;
}

// ---------------------------------------------------------------------------
// Prompt understanding — output of the second Groq call
// ---------------------------------------------------------------------------

export type PromptIntent =
  | "predict"
  | "compare"
  | "track"
  | "explore"
  | "diagnose";

export interface PromptUnderstanding {
  intent: PromptIntent;
  entities: string[];
  target: string;
  isVague: boolean;
  clarifyingQuestions: string[];
}

// ---------------------------------------------------------------------------
// Feature engineering — output of the third Groq call + local execution
// ---------------------------------------------------------------------------

export type EngineeringTechnique =
  | "transformation"
  | "aggregation"
  | "encoding"
  | "decomposition"
  | "derived_score";

export interface EngineeredFeature {
  newColumnName: string;
  technique: EngineeringTechnique;
  formula: string;
  reason: string;
  sourceColumns: string[];
}

export interface EngineeringMeta {
  selectedColumns: string[];
  engineeredFeatures: EngineeredFeature[];
  totalColumns: number;
  /** Decoding map for label-encoded binary columns: columnName → {zero, one} labels */
  labelEncodings?: Record<string, { zero: string; one: string }>;
}

export interface EngineerFeaturesResult {
  vizReadyRows: Record<string, unknown>[];
  engineeredMeta: EngineeringMeta;
}

// ---------------------------------------------------------------------------
// EDA result — output of the local EDA engine
// ---------------------------------------------------------------------------

export interface NumericBin {
  min: number;
  max: number;
  count: number;
}

export interface NumericDistribution {
  type: "numeric";
  bins: NumericBin[];
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
}

export interface CategoricalDistribution {
  type: "categorical" | "boolean";
  values: { value: string; count: number; percentage: number }[];
}

export interface DatetimeDistribution {
  type: "datetime";
  min: string;
  max: string;
  spanDays: number;
}

export type ColumnDistribution =
  | NumericDistribution
  | CategoricalDistribution
  | DatetimeDistribution;

export interface ColumnRelationship {
  col1: string;
  col2: string;
  strength: number;
  type: string;
}

export interface ColumnTrend {
  direction: "increasing" | "decreasing" | "flat";
  slope: number;
  rSquared: number;
}

export interface TemporalTrends {
  dateColumn: string;
  trends: Record<string, ColumnTrend>;
}

export interface CompositionEntry {
  value: string;
  count: number;
  percentage: number;
  mean: number | null;
}

export interface EDAResult {
  correlationMatrix: Record<string, Record<string, number>>;
  distributions: Record<string, ColumnDistribution>;
  topRelationships: ColumnRelationship[];
  temporalTrends: TemporalTrends | null;
  compositions: Record<string, Record<string, CompositionEntry[]>>;
}

// ---------------------------------------------------------------------------
// Dashboard blueprint — output of the fourth Groq call
// ---------------------------------------------------------------------------

export type ChartType =
  | "bar"
  | "line"
  | "scatter"
  | "pie"
  | "donut"
  | "histogram"
  | "heatmap"
  | "bubble"
  | "funnel";

export type ChartRelevance = "high" | "medium" | "exploratory";

export interface ChartBlueprint {
  chartId: string;
  chartType: ChartType;
  title: string;
  xAxis: string | null;
  yAxis: string | null;
  groupBy: string | null;
  colorBy: string | null;
  narrative: string;
  relevance: ChartRelevance;
  order: number;
}

export interface DashboardBlueprint {
  dashboardTitle: string;
  dashboardNarrative: string;
  charts: ChartBlueprint[];
}
