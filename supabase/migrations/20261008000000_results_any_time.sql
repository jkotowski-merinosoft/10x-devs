-- The organizer may enter a match result at any time; the kick-off rule moves to the app.
-- /api/results refuses a result before kick-off unless RESULTS_BEFORE_KICKOFF is set
-- (testing only), so RLS checks just the role. The column grant (score_a, score_b) is
-- unchanged, so the organizer still cannot edit teams or the date. Points stay consistent:
-- tips_set_points() also scores a tip corrected before kick-off on a match with a result.

drop policy if exists "matches_update_result_organizer" on public.matches;
create policy "matches_update_result_organizer" on public.matches
  for update
  to authenticated
  using (public.is_organizer())
  with check (public.is_organizer());
