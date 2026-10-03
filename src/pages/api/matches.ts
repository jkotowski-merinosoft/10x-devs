import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { createClient } from "@/lib/supabase";
import { createMatch } from "@/lib/services/matches";
import { warsawLocalToUtc } from "@/lib/time";

const side = (label: string) =>
  z.string(`Podaj ${label}`).trim().min(1, `Podaj ${label}`).max(100, `Nazwa (${label}) może mieć najwyżej 100 znaków`);

const matchSchema = z
  .object({
    side_a: side("pierwszą stronę"),
    side_b: side("drugą stronę"),
    starts_at: z.string("Podaj datę i godzinę rozpoczęcia").transform((value, ctx) => {
      const utc = warsawLocalToUtc(value);
      if (!utc) {
        ctx.addIssue({ code: "custom", message: "Nieprawidłowa data lub godzina rozpoczęcia (czas warszawski)" });
        return z.NEVER;
      }
      return utc.toISOString();
    }),
  })
  .refine((data) => data.side_a.toLowerCase() !== data.side_b.toLowerCase(), {
    message: "Strony meczu muszą być różne",
    path: ["side_b"],
  });

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
