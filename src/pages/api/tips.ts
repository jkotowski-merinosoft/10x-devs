import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getMatch } from "@/lib/services/matches";
import { saveTip } from "@/lib/services/tips";
import { matchIdSchema, scoresSchema } from "@/lib/schemas/tip";

export const POST: APIRoute = async (context) => {
  const redirectToList = (message: string) => context.redirect(`/matches?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectToList("Supabase is not configured");
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const matchId = matchIdSchema.safeParse(form.get("match_id") ?? undefined);
  if (!matchId.success) {
    return redirectToList(matchId.error.issues[0]?.message ?? "Nieprawidłowy mecz");
  }

  const redirectToMatch = (message: string) =>
    context.redirect(`/matches/${matchId.data}?error=${encodeURIComponent(message)}`);

  const { data: match, error: matchError } = await getMatch(supabase, matchId.data);
  if (matchError) {
    return redirectToMatch(matchError);
  }
  if (!match) {
    return redirectToList("Nie ma takiego meczu");
  }

  // Only for a readable message; RLS enforces the time limit on its own.
  if (Date.now() >= new Date(match.starts_at).getTime()) {
    return redirectToMatch("Typowanie tego meczu jest zamknięte");
  }

  const parsed = scoresSchema.safeParse({
    score_a: form.get("score_a") ?? undefined,
    score_b: form.get("score_b") ?? undefined,
  });
  if (!parsed.success) {
    return redirectToMatch(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane formularza");
  }

  const { error } = await saveTip(supabase, user.id, { match_id: match.id, ...parsed.data });
  if (error) {
    return redirectToMatch(error);
  }

  return context.redirect(`/matches/${match.id}`);
};
