-- A second clean start, cut down to what is actually being lived.
--
-- Fight camp runs 21 October to 29 November and the brand plan starts the
-- same day, so the record starts there too. The old record is archived as
-- rule-before-reset-<date>.db before this runs.
--
-- What went, and why, in his own reckoning:
--   the three objectives   — tracked on the weekly sheet already
--   ejaculation            — tracked on the printed 40-day retention calendar
--   no digital tech in the room — done without thinking about it now
--   no ultra-processed food, no refined sugar, whole foods — committed to,
--                            not worth a line
--   TRE, the exercise set  — the exercises float through the working day now,
--                            fitted in when an hour has gone by
--   read before bed, the podcast — he does the reading anyway, and going to
--                            sleep on a podcast was weird
--
-- What arrived: a run to start the morning, the supplements, and the fast.
--
-- The morning is run, sit, read on a weekday; outside, light stretching and
-- sunlight at the weekend, with the sit saved for the evening. The weekend
-- mornings are boxing days at ten, after a bar shift that finished at one.

DELETE FROM step_check;
DELETE FROM mark;
DELETE FROM block;
DELETE FROM day_flag;
DELETE FROM day;
DELETE FROM week;
DELETE FROM month;
DELETE FROM routine_step;
DELETE FROM standard;

INSERT INTO standard
  (lineage_id, display_order, name, definition, kind, weekdays, pinned, effective_from) VALUES

(1, 1, 'Wake by 09:00',
 'Up by nine, Monday to Saturday. Sunday I can sleep in.',
 'binary', 'MTWTFS-', 0, '2026-10-21'),

(2, 2, 'Morning routine',
 'No phone until the morning routine is done.',
 'checklist', 'MTWTFSS', 0, '2026-10-21'),

(3, 3, 'Intermittent fasting',
 'Eat between 13:00 and 21:30, Monday to Friday.',
 'abstain', 'MTWTF--', 0, '2026-10-21'),

(4, 4, 'Supplements',
 'After lunch: vitamin D3, magnesium, beef liver, creatine.',
 'binary', 'MTWTFSS', 0, '2026-10-21'),

(5, 5, 'No porn',
 'No intentionally seeking sexually explicit content, anywhere: Instagram, Reddit, anything. Once is a fail. Retention itself is on the camp calendar, not here.',
 'abstain', 'MTWTFSS', 1, '2026-10-21'),

(6, 6, 'No TV or films',
 'Monday to Saturday; Sunday is open. Includes entertainment YouTube. YouTube for indirect knowledge is allowed once the day''s work is done. Other than that, all YouTube and social media has to be directly related to the work. Podcasts are allowed, but not in bed.',
 'abstain', 'MTWTFS-', 0, '2026-10-21'),

(7, 7, 'No phone or technology on the toilet', '', 'abstain', 'MTWTFSS', 0, '2026-10-21'),

(8, 8, 'Weekly review & plan',
 'Saturday. Reflect on the week that went, then plan the week that comes.',
 'binary', '-----S-', 0, '2026-10-21'),

(9, 9, 'Evening routine',
 'Begin when you get in. Phone off, then down through the list.',
 'checklist', 'MTWTFSS', 0, '2026-10-21');

-- The morning. A run on a weekday; at the weekend the run goes, the sit moves
-- to the evening, and what is left is getting outside into the light.
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 1, 'Run', '', 'MTWTF--', 0 FROM standard WHERE lineage_id = 2;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 2, 'Meditate — 15 minutes', '', 'MTWTF--', 0 FROM standard WHERE lineage_id = 2;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 3, 'Read', 'As long as it lasts.', 'MTWTF--', 0 FROM standard WHERE lineage_id = 2;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 4, 'Outside — sunlight and a stretch', 'No run. Get into the light and loosen off.',
  '-----SS', 0 FROM standard WHERE lineage_id = 2;

-- The evening. No reading step and no podcast: the reading happens without
-- being asked for, and nothing digital comes up to the room anyway.
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 1, 'Phone turned off', '', NULL, 0 FROM standard WHERE lineage_id = 9;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 2, 'Plan & reflect on the day', '', NULL, 0 FROM standard WHERE lineage_id = 9;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 3, 'Journal', 'Even one minute counts.', NULL, 0 FROM standard WHERE lineage_id = 9;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 4, 'Set out tomorrow''s outfit', '', NULL, 0 FROM standard WHERE lineage_id = 9;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 5, 'Meditate — 15 minutes', '', NULL, 0 FROM standard WHERE lineage_id = 9;
