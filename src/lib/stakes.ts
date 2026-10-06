import type { LeagueStakes } from "@/types";

// Scoring hint shown next to a tip; without stakes (load error) it stays generic.
export function stakesHint(stakes: LeagueStakes | null): string {
  return stakes
    ? `Dokładny wynik: ${stakes.exact_points} pkt. Trafiony zwycięzca albo remis przy innym wyniku: ${stakes.outcome_points} pkt.`
    : "Trafiony zwycięzca albo remis też daje punkty, nawet przy innym wyniku.";
}
