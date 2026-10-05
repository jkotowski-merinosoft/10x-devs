import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createMatch } from "@/lib/services/matches";
import { matchSchema } from "@/lib/schemas/match";

export const POST: APIRoute = async (context) => {
  // Islands ask for JSON; HTML forms and the smoke test get redirects.
  const wantsJson = context.request.headers.get("accept")?.includes("application/json") ?? false;
  const fail = (message: string, status: number) =>
    wantsJson
      ? Response.json({ error: message }, { status })
      : context.redirect(`/matches?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured", 500);
  }

  if (context.locals.role !== "organizer") {
    return fail("Tylko organizator może dodawać mecze", 403);
  }

  const form = await context.request.formData();
  const parsed = matchSchema.safeParse({
    side_a: form.get("side_a") ?? undefined,
    side_b: form.get("side_b") ?? undefined,
    starts_at: form.get("starts_at") ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane formularza", 400);
  }

  const { data: match, error } = await createMatch(supabase, parsed.data);
  if (error) {
    return fail(error, 500);
  }

  if (wantsJson) {
    return Response.json({ match }, { status: 201 });
  }
  return context.redirect("/matches");
};
