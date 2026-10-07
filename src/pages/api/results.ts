import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getMatch, setMatchResult } from "@/lib/services/matches";
import { getOwnTip } from "@/lib/services/tips";
import { matchIdSchema, scoresSchema } from "@/lib/schemas/tip";
import type { MatchResultInput } from "@/types";

export const POST: APIRoute = async (context) => {
  // Islands ask for JSON; HTML forms and the smoke test get redirects.
  const wantsJson = context.request.headers.get("accept")?.includes("application/json") ?? false;
  const failToList = (message: string, status: number) =>
    wantsJson
      ? Response.json({ error: message }, { status })
      : context.redirect(`/matches?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return failToList("Supabase is not configured", 500);
  }

  const form = await context.request.formData();
  const matchId = matchIdSchema.safeParse(form.get("match_id") ?? undefined);

  const failToMatch = (id: number, message: string, status: number) =>
    wantsJson
      ? Response.json({ error: message }, { status })
      : context.redirect(`/matches/${id}?error=${encodeURIComponent(message)}`);

  if (context.locals.role !== "organizer") {
    const message = "Tylko organizator może wpisywać wyniki";
    return matchId.success ? failToMatch(matchId.data, message, 403) : failToList(message, 403);
  }

  if (!matchId.success) {
    return failToList(matchId.error.issues[0]?.message ?? "Nieprawidłowy mecz", 400);
  }

  const { data: match, error: matchError } = await getMatch(supabase, matchId.data);
  if (matchError) {
    return failToMatch(matchId.data, matchError, 500);
  }
  if (!match) {
    return failToList("Nie ma takiego meczu", 404);
  }

  // Only for a readable message; RLS enforces the kick-off rule on its own.
  if (Date.now() < new Date(match.starts_at).getTime()) {
    return failToMatch(match.id, "Wynik można wpisać dopiero po rozpoczęciu meczu", 409);
  }

  let result: MatchResultInput | null = null;
  if (form.get("action") !== "clear") {
    const parsed = scoresSchema.safeParse({
      score_a: form.get("score_a") ?? undefined,
      score_b: form.get("score_b") ?? undefined,
    });
    if (!parsed.success) {
      return failToMatch(match.id, parsed.error.issues[0]?.message ?? "Nieprawidłowe dane formularza", 400);
    }
    result = parsed.data;
  }

  const { data: saved, error } = await setMatchResult(supabase, match.id, result);
  if (error) {
    return failToMatch(match.id, error, 500);
  }

  if (wantsJson) {
    // The caller's own tip, already rescored by the DB trigger; null if they did not tip this match.
    const user = context.locals.user;
    const { data: tip, error: tipError } = user
      ? await getOwnTip(supabase, user.id, match.id)
      : { data: null, error: null };
    if (tipError) {
      return Response.json({ error: tipError }, { status: 500 });
    }
    return Response.json({ match: saved, tip });
  }
  return context.redirect(`/matches/${match.id}`);
};
