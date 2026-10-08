import type { Match } from "@/types";

/**
 * Whether the organizer may enter the match result at `now` (ms). Normally only after kick-off;
 * `allowBeforeKickoff` (RESULTS_BEFORE_KICKOFF, for testing) lifts the time rule. RLS checks only the role.
 */
export function canEnterResult(match: Pick<Match, "starts_at">, now: number, allowBeforeKickoff: boolean): boolean {
  return allowBeforeKickoff || now >= new Date(match.starts_at).getTime();
}
