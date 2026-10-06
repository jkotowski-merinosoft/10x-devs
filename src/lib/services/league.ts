import type { createClient } from "@/lib/supabase";
import type { LeagueStakes } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const LOAD_ERROR = "Nie udało się wczytać stawek";
const SAVE_ERROR = "Nie udało się zapisać stawek";

/** The single league_settings row is seeded by its migration, so a missing row is an error too. */
export async function getStakes(
  supabase: SupabaseClient,
): Promise<{ data: LeagueStakes | null; error: string | null }> {
  const { data, error } = await supabase
    .from("league_settings")
    .select("exact_points, outcome_points")
    .eq("id", true)
    .maybeSingle<LeagueStakes>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: null, error: LOAD_ERROR };
  }
  if (!data) {
    // eslint-disable-next-line no-console
    console.error("league_settings row is missing");
    return { data: null, error: LOAD_ERROR };
  }
  return { data, error: null };
}

export async function updateStakes(
  supabase: SupabaseClient,
  input: LeagueStakes,
): Promise<{ data: LeagueStakes | null; error: string | null }> {
  // RLS lets only an organizer update; for anyone else zero rows come back and .single() fails.
  const { data, error } = await supabase
    .from("league_settings")
    .update({ exact_points: input.exact_points, outcome_points: input.outcome_points })
    .eq("id", true)
    .select("exact_points, outcome_points")
    .single<LeagueStakes>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: null, error: SAVE_ERROR };
  }
  return { data, error: null };
}
