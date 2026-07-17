-- goal_templates was defined in the initial schema but never got an RLS
-- policy (a gap in the original plan's RLS section, caught during Phase 2
-- review). It's shared reference data, readable by any authenticated user,
-- not family-scoped. No insert/update/delete policy: template management
-- is an admin/service-role concern, same posture as goal_monthly_targets
-- and monthly_prizes.
alter table goal_templates enable row level security;

create policy "read goal templates"
  on goal_templates for select
  to authenticated
  using (true);
