import { z } from "astro/zod";

// Shared by the stakes endpoint and the client form; mirrors the league_settings_stakes_range CHECK.

export const POINTS_MESSAGE = "Stawka musi być liczbą całkowitą od 0 do 99";

// Digits only, so "1.5", "-1" and "" are rejected rather than coerced.
const points = z
  .string(POINTS_MESSAGE)
  .trim()
  .regex(/^\d{1,2}$/, POINTS_MESSAGE)
  .transform(Number);

// outcome_points >= 0 and outcome_points < exact_points also force exact_points >= 1.
export const stakesSchema = z
  .object({ exact_points: points, outcome_points: points })
  .refine((data) => data.outcome_points < data.exact_points, {
    message: "Stawka za trafiony rezultat musi być niższa niż za dokładny wynik",
    path: ["outcome_points"],
  });
