-- manage own reactions / manage own comments only checked user_id =
-- auth.uid(), not that checkin_id belongs to a checkin within the
-- caller's own family. Not exploitable today (checkin_ids aren't
-- discoverable across families via the app's own select policies), but
-- it's a missing defense-in-depth check inherited from the original
-- schema's RLS design (caught during Phase 4 review, once reactions and
-- comments got their first real write paths).
drop policy "manage own reactions" on reactions;

create policy "manage own reactions"
  on reactions for all
  using (
    user_id = auth.uid()
    and checkin_id in (
      select id from checkins where user_id in (
        select id from profiles where family_id = current_family_id()
      )
    )
  );

drop policy "manage own comments" on comments;

create policy "manage own comments"
  on comments for all
  using (
    user_id = auth.uid()
    and checkin_id in (
      select id from checkins where user_id in (
        select id from profiles where family_id = current_family_id()
      )
    )
  );
