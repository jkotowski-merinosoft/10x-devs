import type { createClient } from "@/lib/supabase";
import type { CreateMatchInput, Match, MatchResultInput } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const SAVE_ERROR = "Nie udało się zapisać meczu";
const LOAD_ERROR = "Nie udało się wczytać meczów";
const LOAD_ONE_ERROR = "Nie udało się wczytać meczu";
const RESULT_ERROR = "Nie udało się zapisać wyniku";

const MATCH_COLUMNS = "id, side_a, side_b, starts_at, created_at, score_a, score_b";

export async function listMatches(supabase: SupabaseClient): Promise<{ data: Match[]; error: string | null }> {
  const { data, error } = await supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .overrideTypes<Match[], { merge: false }>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: [], error: LOAD_ERROR };
  }
  return { data, error: null };
}

/** `{ data: null, error: null }` means the match does not exist. */
export async function getMatch(
  supabase: SupabaseClient,
  id: number,
): Promise<{ data: Match | null; error: string | null }> {
  const { data, error } = await supabase.from("matches").select(MATCH_COLUMNS).eq("id", id).maybeSingle<Match>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: null, error: LOAD_ONE_ERROR };
  }
  return { data, error: null };
}

export async function createMatch(
  supabase: SupabaseClient,
  input: CreateMatchInput,
): Promise<{ data: Match | null; error: string | null }> {
  // created_by is filled by the column default (auth.uid()) and checked by RLS.
  const { data, error } = await supabase.from("matches").insert(input).select(MATCH_COLUMNS).single<Match>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: null, error: SAVE_ERROR };
  }
  return { data, error: null };
}

/** Saves the result, or clears it when `result` is null; DB triggers then rescore the match's tips. */
export async function setMatchResult(
  supabase: SupabaseClient,
  id: number,
  result: MatchResultInput | null,
): Promise<{ data: Match | null; error: string | null }> {
  // RLS lets only an organizer update, and only after kick-off; otherwise zero rows come back and .single() fails.
  const { data, error } = await supabase
    .from("matches")
    .update({ score_a: result?.score_a ?? null, score_b: result?.score_b ?? null })
    .eq("id", id)
    .select(MATCH_COLUMNS)
    .single<Match>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: null, error: RESULT_ERROR };
  }
  return { data, error: null };
}
