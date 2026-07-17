-- Adds checkins, reactions, comments to the supabase_realtime publication
-- so postgres_changes subscriptions can receive INSERT/DELETE events on
-- them.
--
-- IMPORTANT: whether this respects the existing family-scoped select RLS
-- policies per-subscriber, or broadcasts every row change to every
-- connected client regardless of RLS, depends on this project's Realtime
-- Authorization configuration (verified separately, not assumed here).
-- The application code treats client-side family-membership filtering as
-- defense-in-depth, not as the sole safeguard, until that's confirmed.
alter publication supabase_realtime add table checkins;
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table comments;
