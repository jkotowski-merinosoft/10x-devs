export type Role = "organizer" | "employee";

export interface Match {
  id: number;
  side_a: string;
  side_b: string;
  starts_at: string;
  created_at: string;
  /** Final score; both null until the organizer enters the result. */
  score_a: number | null;
  score_b: number | null;
}

export interface CreateMatchInput {
  side_a: string;
  side_b: string;
  /** ISO 8601 timestamp in UTC. */
  starts_at: string;
}

export interface Tip {
  match_id: number;
  score_a: number;
  score_b: number;
  /** Computed by DB triggers from the match result and stakes; null while the match has no result. */
  points: number | null;
}

/** A tip as shown on a match: own before kick-off, everyone's after it. */
export interface MatchTip extends Tip {
  user_id: string;
  /** Masked e-mail, e.g. "jkotowski@m..t.com.pl"; null if it could not be masked. */
  display_name: string | null;
}

export interface MatchResultInput {
  score_a: number;
  score_b: number;
}

export interface SaveTipInput {
  match_id: number;
  score_a: number;
  score_b: number;
}

/** Points for a tip: the exact score, or only the right outcome (win / draw / loss). */
export interface LeagueStakes {
  exact_points: number;
  outcome_points: number;
}

/** One row of `league_standings()`: equal points and exact scores share a rank. */
export interface StandingsRow {
  rank: number;
  user_id: string;
  display_name: string | null;
  points: number;
  exact_count: number;
}
