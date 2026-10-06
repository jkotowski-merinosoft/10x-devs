import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { updateStakes } from "@/lib/services/league";
import { stakesSchema } from "@/lib/schemas/league";

export const POST: APIRoute = async (context) => {
  const fail = (message: string) => context.redirect(`/league?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  if (context.locals.role !== "organizer") {
    return fail("Tylko organizator może zmieniać stawki");
  }

  const form = await context.request.formData();
  const parsed = stakesSchema.safeParse({
    exact_points: form.get("exact_points") ?? undefined,
    outcome_points: form.get("outcome_points") ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Nieprawidłowe dane formularza");
  }

  const { error } = await updateStakes(supabase, parsed.data);
  if (error) {
    return fail(error);
  }

  return context.redirect("/league");
};
