import type { createClient } from "@/lib/supabase";
import type { MatchTip, SaveTipInput, Tip } from "@/types";

type SupabaseClient = NonNullable<ReturnType<typeof createClient>>;

const SAVE_ERROR = "Nie udało się zapisać typu";
const LOAD_OWN_ERROR = "Nie udało się wczytać Twoich typów";
const LOAD_MATCH_ERROR = "Nie udało się wczytać typów meczu";

interface Profile {
  display_name: string | null;
}

interface MatchTipRow extends Tip {
  user_id: string;
  // Without generated DB types the embed may come back as an object or a one-element array.
  profiles: Profile | Profile[] | null;
}

export async function listOwnTips(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: Tip[]; error: string | null }> {
  // RLS also returns other users' tips for started matches, so filter by user explicitly.
  const { data, error } = await supabase
    .from("tips")
    .select("match_id, score_a, score_b")
    .eq("user_id", userId)
    .overrideTypes<Tip[], { merge: false }>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: [], error: LOAD_OWN_ERROR };
  }
  return { data, error: null };
}

/** Tips visible to the caller on one match: only their own before kick-off, everyone's after it (RLS). */
export async function listMatchTips(
  supabase: SupabaseClient,
  matchId: number,
): Promise<{ data: MatchTip[]; error: string | null }> {
  const { data, error } = await supabase
    .from("tips")
    .select("match_id, user_id, score_a, score_b, profiles(display_name)")
    .eq("match_id", matchId)
    .overrideTypes<MatchTipRow[], { merge: false }>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: [], error: LOAD_MATCH_ERROR };
  }

  const tips = data.map(({ profiles, ...tip }): MatchTip => {
    const profile = Array.isArray(profiles) ? profiles[0] : profiles;
    return { ...tip, display_name: profile?.display_name ?? null };
  });

  // By display name, unnamed last; ties by user id for a stable order.
  tips.sort((a, b) => {
    if (a.display_name !== b.display_name) {
      if (a.display_name === null) return 1;
      if (b.display_name === null) return -1;
      const byName = a.display_name.localeCompare(b.display_name, "pl");
      if (byName !== 0) return byName;
    }
    return a.user_id.localeCompare(b.user_id);
  });

  return { data: tips, error: null };
}

export async function saveTip(
  supabase: SupabaseClient,
  userId: string,
  input: SaveTipInput,
): Promise<{ data: Tip | null; error: string | null }> {
  // RLS rejects the upsert once the match has started, even if the endpoint's check passed.
  const { data, error } = await supabase
    .from("tips")
    .upsert({ ...input, user_id: userId }, { onConflict: "match_id,user_id" })
    .select("match_id, score_a, score_b")
    .single<Tip>();

  if (error) {
    // eslint-disable-next-line no-console
    console.error(error.message);
    return { data: null, error: SAVE_ERROR };
  }
  return { data, error: null };
}
