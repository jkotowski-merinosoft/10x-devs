import type { createClient } from "@/lib/supabase";
import type { LeagueStakes, StandingsRow } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const LOAD_ERROR = "Nie udało się wczytać stawek";
const SAVE_ERROR = "Nie udało się zapisać stawek";
const STANDINGS_ERROR = "Nie udało się wczytać klasyfikacji";

// `bigint` columns may come back from PostgREST as strings; they are converted to numbers below.
interface StandingsRpcRow {
  rank: number | string;
  user_id: string;
  display_name: string | null;
  points: number | string;
  exact_count: number | string;
}

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

/** League ranking from `league_standings()`, already ordered by rank. */
export async function listStandings(supabase: SupabaseClient): Promise<{ data: StandingsRow[]; error: string | null }> {
  // Without generated DB types the RPC result is untyped.
  const { data, error } = (await supabase.rpc("league_standings")) as {
    data: StandingsRpcRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: [], error: STANDINGS_ERROR };
  }
  return {
    data: (data ?? []).map((row) => ({
      rank: Number(row.rank),
      user_id: row.user_id,
      display_name: row.display_name,
      points: Number(row.points),
      exact_count: Number(row.exact_count),
    })),
    error: null,
  };
}
