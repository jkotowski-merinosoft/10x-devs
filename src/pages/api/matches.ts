import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { createMatch } from "@/lib/services/matches";
import { matchSchema } from "@/lib/schemas/match";

export const POST: APIRoute = async (context) => {
  const redirectWithError = (message: string) => context.redirect(`/matches?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError("Supabase is not configured");
  }

  if (context.locals.role !== "organizer") {
    return redirectWithError("Tylko organizator może dodawać mecze");
  }

  const form = await context.request.formData();
  const parsed = matchSchema.safeParse({
    side_a: form.get("side_a") ?? undefined,
    side_b: form.get("side_b") ?? undefined,
    starts_at: form.get("starts_at") ?? undefined,
  });
  if (!parsed.success) {
    return redirectWithError(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane formularza");
  }

  const { error } = await createMatch(supabase, parsed.data);
  if (error) {
    return redirectWithError(error);
  }

  return context.redirect("/matches");
};
