import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getMatch } from "@/lib/services/matches";
import { saveTip } from "@/lib/services/tips";
import { matchIdSchema, scoresSchema } from "@/lib/schemas/tip";

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

  const user = context.locals.user;
  // Defense in depth: the middleware already redirects anonymous requests to this protected route.
  if (!user) {
    return wantsJson
      ? Response.json({ error: "Zaloguj się, aby typować" }, { status: 401 })
      : context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const matchId = matchIdSchema.safeParse(form.get("match_id") ?? undefined);
  if (!matchId.success) {
    return failToList(matchId.error.issues[0]?.message ?? "Nieprawidłowy mecz", 400);
  }

  const failToMatch = (message: string, status: number) =>
    wantsJson
      ? Response.json({ error: message }, { status })
      : context.redirect(`/matches/${matchId.data}?error=${encodeURIComponent(message)}`);

  const { data: match, error: matchError } = await getMatch(supabase, matchId.data);
  if (matchError) {
    return failToMatch(matchError, 500);
  }
  if (!match) {
    return failToList("Nie ma takiego meczu", 404);
  }

  // Only for a readable message; RLS enforces the time limit on its own.
  if (Date.now() >= new Date(match.starts_at).getTime()) {
    return failToMatch("Typowanie tego meczu jest zamknięte", 409);
  }

  const parsed = scoresSchema.safeParse({
    score_a: form.get("score_a") ?? undefined,
    score_b: form.get("score_b") ?? undefined,
  });
  if (!parsed.success) {
    return failToMatch(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane formularza", 400);
  }

  const { data: tip, error } = await saveTip(supabase, user.id, { match_id: match.id, ...parsed.data });
  if (error) {
    return failToMatch(error, 500);
  }

  if (wantsJson) {
    return Response.json({ tip });
  }
  return context.redirect(`/matches/${match.id}`);
};
