import { parseFile } from "@/lib/data/fileParser";
import { profileDataset } from "@/lib/data/profiler";
import { buildContextPackage } from "@/lib/data/sampler";
import {
  understandData,
  understandPrompt,
  engineerFeatures,
  generateBlueprint,
} from "@/lib/data/groqClient";
import { cleanDataset } from "@/lib/data/cleaner";
import { runEDA } from "@/lib/data/eda";
import { usePipelineStore } from "@/lib/store/pipelineStore";
import type { DataProfile, PromptUnderstanding } from "@/types/data";
import type { Rows } from "@/lib/store/pipelineStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStore() {
  return usePipelineStore.getState();
}

function stageError(stage: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `${stage} failed: ${msg}`;
}

// ---------------------------------------------------------------------------
// Post-prompt steps (shared between runPipeline and resumePipeline)
// Steps: feature engineering → EDA → blueprint → ready
// ---------------------------------------------------------------------------

async function runPostPromptSteps(
  cleanedRows: Rows,
  cleanedProfile: DataProfile,
  promptUnderstanding: PromptUnderstanding
): Promise<void> {
  const store = getStore();

  // Feature engineering
  store.setPipelineStatus("engineering");
  let engineerResult;
  try {
    engineerResult = await engineerFeatures(
      promptUnderstanding,
      cleanedRows,
      cleanedProfile
    );
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Feature engineering", err));
    return;
  }
  store.setVizReadyRows(engineerResult.vizReadyRows);
  store.setEngineeredMeta(engineerResult.engineeredMeta);

  // EDA
  store.setPipelineStatus("eda");
  let edaResult;
  try {
    edaResult = runEDA(
      engineerResult.vizReadyRows,
      engineerResult.engineeredMeta.selectedColumns
    );
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("EDA", err));
    return;
  }
  store.setEdaResult(edaResult);

  // Dashboard blueprint
  store.setPipelineStatus("blueprint");
  let blueprint;
  try {
    blueprint = await generateBlueprint(
      edaResult,
      promptUnderstanding,
      engineerResult.engineeredMeta
    );
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Blueprint generation", err));
    return;
  }
  store.setDashboardBlueprint(blueprint);
  // Pause here so the user can choose which charts to include.
  // Processing page shows ChartSelectionCard; continuing sets status → "ready".
  store.setPipelineStatus("chart_selection");
}

// ---------------------------------------------------------------------------
// runPipeline — full pipeline from file upload through dashboard blueprint.
//
// When the prompt is vague, the pipeline halts after prompt understanding
// (pipelineStatus stays "prompt") and populates clarifyingQuestions.
// The frontend should then surface those questions and call resumePipeline()
// once the user has provided a clearer prompt.
// ---------------------------------------------------------------------------

export async function runPipeline(
  file: File,
  userPrompt: string
): Promise<void> {
  const store = getStore();

  store.reset();
  store.setUploadedFile(file);
  store.setUserPrompt(userPrompt);

  // ------------------------------------------------------------------
  // Stage 1: Parse + profile
  // ------------------------------------------------------------------
  store.setPipelineStatus("profiling");

  let rows: Rows;
  let columns: string[];
  try {
    const parsed = await parseFile(file);
    rows = parsed.rows;
    columns = parsed.columns;
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("File parsing", err));
    return;
  }

  let originalProfile: DataProfile;
  try {
    originalProfile = profileDataset(rows, columns);
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Data profiling", err));
    return;
  }

  // ------------------------------------------------------------------
  // Stage 2: Build context package (smart sampling)
  // ------------------------------------------------------------------
  store.setPipelineStatus("sampling");

  let contextPackage;
  try {
    contextPackage = buildContextPackage(rows, originalProfile);
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Context sampling", err));
    return;
  }

  // ------------------------------------------------------------------
  // Stage 3: LLM — data understanding (column roles + cleaning plan)
  // ------------------------------------------------------------------
  store.setPipelineStatus("understanding");

  let dataUnderstanding;
  try {
    dataUnderstanding = await understandData(contextPackage);
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Data understanding", err));
    return;
  }
  store.setDataUnderstanding(dataUnderstanding);

  // ------------------------------------------------------------------
  // Stage 4: Local cleaning
  // ------------------------------------------------------------------
  store.setPipelineStatus("cleaning");

  let cleanedRows: Rows;
  let cleanedProfile: DataProfile;
  try {
    const cleanResult = cleanDataset(
      rows,
      dataUnderstanding.cleaningPlan,
      originalProfile
    );
    cleanedRows = cleanResult.cleanedRows;
    cleanedProfile = cleanResult.cleanedProfile;
    store.setDiffSummary(cleanResult.diffSummary);
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Data cleaning", err));
    return;
  }
  store.setCleanedRows(cleanedRows);
  // dataProfile is updated to the cleaned profile — this is the authoritative
  // profile for all downstream stages.
  store.setDataProfile(cleanedProfile);

  // ------------------------------------------------------------------
  // Stage 5: LLM — prompt understanding (intent + entities + vagueness)
  // ------------------------------------------------------------------
  store.setPipelineStatus("prompt");

  let promptUnderstanding: PromptUnderstanding;
  try {
    promptUnderstanding = await understandPrompt(userPrompt, cleanedProfile);
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Prompt understanding", err));
    return;
  }
  store.setPromptUnderstanding(promptUnderstanding);

  if (promptUnderstanding.isVague) {
    // Halt here. pipelineStatus stays "prompt" so the frontend can detect
    // the pause and display clarifyingQuestions.
    store.setClarifyingQuestions(promptUnderstanding.clarifyingQuestions);
    return;
  }

  // ------------------------------------------------------------------
  // Stages 6–8: Engineering → EDA → Blueprint
  // ------------------------------------------------------------------
  await runPostPromptSteps(cleanedRows, cleanedProfile, promptUnderstanding);
}

// ---------------------------------------------------------------------------
// resumePipeline — re-runs from prompt understanding onward using the
// already-cleaned dataset stored in the pipeline store.
//
// Call this after the user has answered the clarifying questions.
// ---------------------------------------------------------------------------

export async function resumePipeline(clarifiedPrompt: string): Promise<void> {
  const store = getStore();
  const { cleanedRows, dataProfile } = store;

  if (!cleanedRows || !dataProfile) {
    store.setPipelineStatus("error");
    store.setPipelineError(
      "Resume failed: no cleaned dataset in store. Please upload your file again."
    );
    return;
  }

  store.setUserPrompt(clarifiedPrompt);
  store.setClarifyingQuestions([]);
  // Clear downstream results so stale data is never visible
  store.setPromptUnderstanding(null);
  store.setVizReadyRows(null);
  store.setEngineeredMeta(null);
  store.setEdaResult(null);
  store.setDashboardBlueprint(null);
  store.setPipelineError(null);

  // ------------------------------------------------------------------
  // Re-run prompt understanding with the clarified prompt
  // ------------------------------------------------------------------
  store.setPipelineStatus("prompt");

  let promptUnderstanding: PromptUnderstanding;
  try {
    promptUnderstanding = await understandPrompt(clarifiedPrompt, dataProfile);
  } catch (err) {
    store.setPipelineStatus("error");
    store.setPipelineError(stageError("Prompt understanding", err));
    return;
  }
  store.setPromptUnderstanding(promptUnderstanding);

  if (promptUnderstanding.isVague) {
    store.setClarifyingQuestions(promptUnderstanding.clarifyingQuestions);
    return;
  }

  await runPostPromptSteps(cleanedRows, dataProfile, promptUnderstanding);
}
