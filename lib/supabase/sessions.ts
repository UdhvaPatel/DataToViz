import { createClient } from '@/lib/supabase/client'
import type { Session } from "@/types/supabase";
import type { DashboardBlueprint, EngineeringMeta } from "@/types/data";
import type { Rows } from "@/lib/store/pipelineStore";

export interface SessionData {
  userPrompt: string;
  datasetFilename: string;
  datasetRowCount: number;
  datasetColCount: number;
  vizReadyRows: Rows;
  engineeredMeta: EngineeringMeta;
  dashboardBlueprint: DashboardBlueprint;
  selectedChartIds: string[];
}

export async function saveSession(userId: string, data: SessionData): Promise<string | null> {
  console.log('[saveSession] Function entered with userId:', userId)
  console.log('[saveSession] Data keys:', Object.keys(data))
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    console.log('[saveSession] Auth session:', session?.user?.id)
    if (!session) {
      console.error('[saveSession] No active auth session — aborting')
      return null
    }
    const { data: rows, error } = await supabase
      .from('sessions')
      .insert({
        user_id:               userId,
        dashboard_title:       data.dashboardBlueprint.dashboardTitle,
        dashboard_narrative:   data.dashboardBlueprint.dashboardNarrative ?? '',
        user_prompt:           data.userPrompt,
        file_name:             data.datasetFilename,
        row_count:             data.datasetRowCount,
        column_count:          data.datasetColCount,
        chart_count:           data.selectedChartIds.length,
        viz_ready_rows:        data.vizReadyRows.slice(0, 1000),
        engineered_meta:       data.engineeredMeta,
        dashboard_blueprint:   data.dashboardBlueprint,
        selected_chart_ids:    data.selectedChartIds,
        truncated_for_storage: data.vizReadyRows.length > 1000,
      })
      .select()
    if (error) {
      console.error('[saveSession] Insert failed:', error.message, error.details, error.hint)
      return null
    }
    const inserted = rows?.[0]
    if (!inserted) {
      console.error('[saveSession] No row returned after insert')
      return null
    }
    console.log('[saveSession] Saved successfully, id:', inserted.id)
    await supabase.rpc('increment_total_sessions', { uid: userId })
    return inserted.id as string
  } catch (err) {
    console.error('[saveSession] Unexpected error:', err)
    return null
  }
}

export async function updateChartUsage(
  userId: string,
  selectedCharts: { chartType: string }[]
): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()

  // Tally uses per chart type
  const typeCounts = new Map<string, number>()
  for (const chart of selectedCharts) {
    typeCounts.set(chart.chartType, (typeCounts.get(chart.chartType) ?? 0) + 1)
  }

  for (const [chartType, addCount] of typeCounts) {
    const { data: existing } = await supabase
      .from('chart_usage')
      .select('id, use_count')
      .eq('user_id', userId)
      .eq('chart_type', chartType)
      .single()

    if (existing) {
      await supabase
        .from('chart_usage')
        .update({ use_count: (existing.use_count as number) + addCount, last_used_at: now })
        .eq('id', (existing as Record<string, unknown>).id)
    } else {
      await supabase
        .from('chart_usage')
        .insert({ user_id: userId, chart_type: chartType, use_count: addCount, last_used_at: now })
    }
  }
}

export async function getUserSessions(userId: string): Promise<Session[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select(
      "id, user_id, file_name, user_prompt, dashboard_title, dashboard_narrative, row_count, column_count, chart_count, selected_chart_ids, truncated_for_storage, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as Session[];
}

export async function getSessionById(sessionId: string): Promise<Session | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error) return null;
  return data as Session;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId);

  return !error;
}
