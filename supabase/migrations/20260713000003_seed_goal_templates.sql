-- Mirrors supabase/seed.sql. Applied as a migration (not via `db reset`)
-- because this project runs against a hosted Supabase instance without a
-- local Docker/Postgres stack, so `db reset`'s seed step never runs.
insert into goal_templates (title, category, default_frequency_per_week, icon)
select * from (values
  ('Walk 30 minutes', 'cardio', 5, 'footprints'),
  ('Run', 'cardio', 3, 'run'),
  ('Bike ride', 'cardio', 3, 'bike'),
  ('Strength training', 'strength', 3, 'dumbbell'),
  ('Yoga or stretching', 'flexibility', 3, 'yoga'),
  ('Swim', 'cardio', 2, 'swim'),
  ('Drink 8 glasses of water', 'wellness', 7, 'droplet'),
  ('Sleep 8 hours', 'wellness', 7, 'moon'),
  ('Meditate 10 minutes', 'wellness', 5, 'brain'),
  ('Eat a vegetable-forward meal', 'nutrition', 5, 'salad'),
  ('Take the stairs', 'cardio', 5, 'stairs'),
  ('Outdoor hike', 'cardio', 1, 'mountain')
) as t(title, category, default_frequency_per_week, icon)
where not exists (
  select 1 from goal_templates existing where existing.title = t.title
);
