import { z } from "astro/zod";

// Shared by `POST /api/tips` and client forms, so both sides validate with the same messages.

export const SCORE_MESSAGE = "Wynik musi być liczbą całkowitą od 0 do 99";

export const matchIdSchema = z
  .string("Nieprawidłowy mecz")
  .regex(/^[1-9]\d{0,15}$/, "Nieprawidłowy mecz")
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value), "Nieprawidłowy mecz");

// Digits only, so "1.5", "-1" and "" are rejected rather than coerced.
const score = z
  .string(SCORE_MESSAGE)
  .trim()
  .regex(/^\d{1,2}$/, SCORE_MESSAGE)
  .transform(Number);

export const scoresSchema = z.object({ score_a: score, score_b: score });
