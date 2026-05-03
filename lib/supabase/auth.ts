import { createClient } from "./client";
import type { UserProfile } from "@/types/supabase";

export async function getUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data as UserProfile;
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function updateLastActive(userId: string) {
  const supabase = createClient();
  await supabase
    .from("user_profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", userId);
}
