export type Role = "organizer" | "employee";

export interface Match {
  id: number;
  side_a: string;
  side_b: string;
  starts_at: string;
  created_at: string;
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
}

/** A tip as shown on a match: own before kick-off, everyone's after it. */
export interface MatchTip extends Tip {
  user_id: string;
  /** Masked e-mail, e.g. "jkotowski@m..t.com.pl"; null if it could not be masked. */
  display_name: string | null;
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
