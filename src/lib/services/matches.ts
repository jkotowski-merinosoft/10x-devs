import type { createClient } from "@/lib/supabase";
import type { CreateMatchInput, Match } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const SAVE_ERROR = "Nie udało się zapisać meczu";

export async function listMatches(supabase: SupabaseClient): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, side_a, side_b, starts_at, created_at")
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .overrideTypes<Match[], { merge: false }>();

  if (error) {
    console.error(error.message);
    return [];
  }
  return data;
}

export async function createMatch(
  supabase: SupabaseClient,
  input: CreateMatchInput,
): Promise<{ error: string | null }> {
  // created_by is filled by the column default (auth.uid()) and checked by RLS.
  const { error } = await supabase.from("matches").insert(input);

  if (error) {
    console.error(error.message);
    return { error: SAVE_ERROR };
  }
  return { error: null };
}
