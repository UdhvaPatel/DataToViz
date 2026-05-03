export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_active_at: string | null;
  total_dashboards: number;
}

export interface Session {
  id: string;
  user_id: string;
  file_name: string;
  user_prompt: string;
  dashboard_title: string;
  dashboard_narrative: string;
  row_count: number;
  column_count: number;
  chart_count: number;
  viz_ready_rows: Record<string, unknown>[] | null;
  engineered_meta: Record<string, unknown> | null;
  dashboard_blueprint: Record<string, unknown> | null;
  selected_chart_ids: string[];
  truncated_for_storage: boolean;
  created_at: string;
}

export interface ChartUsage {
  id: string;
  user_id: string;
  chart_type: string;
  use_count: number;
  last_used_at: string;
}
