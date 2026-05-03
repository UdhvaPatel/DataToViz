import { create } from "zustand";
import type {
  DataProfile,
  DataUnderstanding,
  CleaningDiff,
  PromptUnderstanding,
  EngineeringMeta,
  EDAResult,
  DashboardBlueprint,
} from "@/types/data";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStatus =
  | "idle"
  | "profiling"
  | "sampling"
  | "understanding"
  | "cleaning"
  | "prompt"
  | "engineering"
  | "eda"
  | "blueprint"
  | "chart_selection"
  | "ready"
  | "error";

export type Rows = Record<string, unknown>[];

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface PipelineState {
  uploadedFile: File | null;
  userPrompt: string;
  dataProfile: DataProfile | null;
  dataUnderstanding: DataUnderstanding | null;
  cleanedRows: Rows | null;
  diffSummary: CleaningDiff | null;
  promptUnderstanding: PromptUnderstanding | null;
  vizReadyRows: Rows | null;
  engineeredMeta: EngineeringMeta | null;
  edaResult: EDAResult | null;
  dashboardBlueprint: DashboardBlueprint | null;
  pipelineStatus: PipelineStatus;
  pipelineError: string | null;
  clarifyingQuestions: string[];
  selectedChartIds: string[];
  parseProgress: number;
  // Auth & persistence
  user: User | null;
  userProfile: UserProfile | null;
  currentSessionId: string | null;
  isSaving: boolean;
  saveError: string | null;
  // Dashboard chart controls
  chartVisibility: Record<string, boolean>;
  chartTypeOverrides: Record<string, string>;
  hiddenCharts: string[];
}

// ---------------------------------------------------------------------------
// Actions shape
// ---------------------------------------------------------------------------

interface PipelineActions {
  setUploadedFile: (file: File | null) => void;
  setUserPrompt: (prompt: string) => void;
  setDataProfile: (profile: DataProfile | null) => void;
  setDataUnderstanding: (understanding: DataUnderstanding | null) => void;
  setCleanedRows: (rows: Rows | null) => void;
  setDiffSummary: (diff: CleaningDiff | null) => void;
  setPromptUnderstanding: (understanding: PromptUnderstanding | null) => void;
  setVizReadyRows: (rows: Rows | null) => void;
  setEngineeredMeta: (meta: EngineeringMeta | null) => void;
  setEdaResult: (result: EDAResult | null) => void;
  setDashboardBlueprint: (blueprint: DashboardBlueprint | null) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setPipelineError: (error: string | null) => void;
  setClarifyingQuestions: (questions: string[]) => void;
  setSelectedChartIds: (ids: string[]) => void;
  setParseProgress: (progress: number) => void;
  clearRawData: () => void;
  reset: () => void;
  // Auth & persistence
  setUser: (user: User | null) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  setCurrentSessionId: (id: string | null) => void;
  setIsSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  // Dashboard chart controls
  toggleChartVisibility: (chartId: string) => void;
  removeChart: (chartId: string) => void;
  changeChartType: (chartId: string, chartType: string) => void;
  resetChartControls: () => void;
}

export type PipelineStore = PipelineState & PipelineActions;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: PipelineState = {
  uploadedFile: null,
  userPrompt: "",
  dataProfile: null,
  dataUnderstanding: null,
  cleanedRows: null,
  diffSummary: null,
  promptUnderstanding: null,
  vizReadyRows: null,
  engineeredMeta: null,
  edaResult: null,
  dashboardBlueprint: null,
  pipelineStatus: "idle",
  pipelineError: null,
  clarifyingQuestions: [],
  selectedChartIds: [],
  parseProgress: 0,
  user: null,
  userProfile: null,
  currentSessionId: null,
  isSaving: false,
  saveError: null,
  chartVisibility: {},
  chartTypeOverrides: {},
  hiddenCharts: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePipelineStore = create<PipelineStore>((set) => ({
  ...initialState,

  setUploadedFile: (file) => set({ uploadedFile: file }),
  setUserPrompt: (prompt) => set({ userPrompt: prompt }),
  setDataProfile: (profile) => set({ dataProfile: profile }),
  setDataUnderstanding: (understanding) => set({ dataUnderstanding: understanding }),
  setCleanedRows: (rows) => set({ cleanedRows: rows }),
  setDiffSummary: (diff) => set({ diffSummary: diff }),
  setPromptUnderstanding: (understanding) => set({ promptUnderstanding: understanding }),
  setVizReadyRows: (rows) => set({ vizReadyRows: rows }),
  setEngineeredMeta: (meta) => set({ engineeredMeta: meta }),
  setEdaResult: (result) => set({ edaResult: result }),
  setDashboardBlueprint: (blueprint) => set({ dashboardBlueprint: blueprint }),
  setPipelineStatus: (status) => set({ pipelineStatus: status }),
  setPipelineError: (error) => set({ pipelineError: error }),
  setClarifyingQuestions: (questions) => set({ clarifyingQuestions: questions }),
  setSelectedChartIds: (ids) => set({ selectedChartIds: ids }),
  setParseProgress: (progress) => set({ parseProgress: progress }),
  clearRawData: () => set({ cleanedRows: null, uploadedFile: null, parseProgress: 0 }),

  reset: () => set(initialState),

  setUser: (user) => set({ user }),
  setUserProfile: (profile) => set({ userProfile: profile }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  setSaveError: (error) => set({ saveError: error }),

  toggleChartVisibility: (chartId) =>
    set((state) => {
      const current = state.chartVisibility[chartId] !== false;
      const next = !current;
      const hidden = next
        ? state.hiddenCharts.filter((id) => id !== chartId)
        : [...state.hiddenCharts.filter((id) => id !== chartId), chartId];
      return {
        chartVisibility: { ...state.chartVisibility, [chartId]: next },
        hiddenCharts: hidden,
      };
    }),

  removeChart: (chartId) =>
    set((state) => ({
      selectedChartIds: state.selectedChartIds.filter((id) => id !== chartId),
    })),

  changeChartType: (chartId, chartType) =>
    set((state) => ({
      chartTypeOverrides: { ...state.chartTypeOverrides, [chartId]: chartType },
    })),

  resetChartControls: () =>
    set({ chartVisibility: {}, chartTypeOverrides: {}, hiddenCharts: [] }),
}));
