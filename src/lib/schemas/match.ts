import { z } from "astro/zod";
import { warsawLocalToUtc } from "@/lib/time";

// Shared by `POST /api/matches` and client forms, so both sides validate with the same messages.

const side = (label: string) =>
  z.string(`Podaj ${label}`).trim().min(1, `Podaj ${label}`).max(100, `Nazwa (${label}) może mieć najwyżej 100 znaków`);

export const matchSchema = z
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
