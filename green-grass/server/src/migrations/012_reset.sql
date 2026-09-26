-- A clean start, from the record up.
--
-- The old record is not deleted — the launch that runs this migration writes
-- rule-before-reset-<date>.db into the backups folder beside the database
-- first, and every earlier daily backup stays where it is. What goes is the
-- live record: the standards, their history, and every mark made against them.
-- The reason is simple and was the owner's: the list had drifted out of step
-- with the life it was meant to describe, and a tally that counts a drifted
-- standard is worse than no tally.
--
-- Everything starts on 27 September 2026. The runs all begin at zero on that
-- day, which is the point — there is a record to break, and nobody holds it.

ALTER TABLE routine_step ADD COLUMN optional INTEGER NOT NULL DEFAULT 0;

DELETE FROM step_check;
DELETE FROM mark;
DELETE FROM exemption;
DELETE FROM day_flag;
DELETE FROM day;
DELETE FROM week;
DELETE FROM month;
DELETE FROM routine_step;
DELETE FROM standard;

INSERT INTO standard
  (lineage_id, display_order, name, definition, kind, weekdays, effective_from) VALUES

(1, 1, 'Wake by 09:00',
 'Up by nine, Monday to Saturday. Sunday I can sleep in.',
 'binary', 'MTWTFS-', '2026-09-27'),

(2, 2, 'Morning routine',
 'No phone until the morning routine is done.',
 'checklist', 'MTWTFSS', '2026-09-27'),

(3, 3, 'Primary objective',
 'The first task you set yourself today. Written in the notepad, ticked here.',
 'binary', 'MTWTFSS', '2026-09-27'),
(4, 4, 'Secondary objective', '', 'binary', 'MTWTFSS', '2026-09-27'),
(5, 5, 'Tertiary objective', '', 'binary', 'MTWTFSS', '2026-09-27'),

(6, 6, 'No porn or ejaculation',
 'One standard, not two — either one breaks it. No intentionally seeking sexually explicit content, anywhere: Instagram, Reddit, anything. And no ejaculation. Once is a fail.',
 'abstain', 'MTWTFSS', '2026-09-27'),

(7, 7, 'No TV or films',
 'Monday to Saturday; Sunday is open. Includes entertainment YouTube. YouTube for indirect knowledge is allowed once the primary, secondary and tertiary objectives are done. Other than that, all YouTube and social media has to be directly related to the objectives. Podcasts are allowed.',
 'abstain', 'MTWTFS-', '2026-09-27'),

(8, 8, 'No digital technology in my room',
 'Nothing digital in the room between finishing the evening routine and finishing the morning routine — no phone, no laptop, no tablet. It leaves when the routine is done and does not come back until the next one is finished.',
 'abstain', 'MTWTFSS', '2026-09-27'),

(9, 9, 'No phone or technology on the toilet', '', 'abstain', 'MTWTFSS', '2026-09-27'),

(10, 10, 'Weekly review & plan',
 'Saturday. Reflect on the week that went, then plan the week that comes.',
 'binary', '-----S-', '2026-09-27'),

(11, 11, 'Evening routine',
 'Monday to Thursday, aim to begin at 22:30.',
 'checklist', 'MTWTFSS', '2026-09-27');

-- The morning. The exercises are the non-negotiable set; a full session on top
-- of them is optional, and an optional step never holds the routine open.
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 1, 'Read', '', NULL, 0 FROM standard WHERE lineage_id = 2;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 2, 'Exercises',
  'Stretching flow, yoga set, 90/90s, breaststroke, quad stretch, band holds.', NULL, 0
  FROM standard WHERE lineage_id = 2;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 3, 'Full exercise session', '', NULL, 1 FROM standard WHERE lineage_id = 2;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 4, 'TRE', '', NULL, 0 FROM standard WHERE lineage_id = 2;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 5, 'Meditate — 30 minutes', '', NULL, 0 FROM standard WHERE lineage_id = 2;

-- The evening. The phone goes to the study every night, late shifts included —
-- the podcast in bed plays off the Alexa, so nothing digital has to be in the
-- room. Friday and Saturday are the late nights home from the bar, where a
-- podcast does the job a book does on a quiet night.
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 1, 'Phone stored away in study', '', NULL, 0 FROM standard WHERE lineage_id = 11;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 2, 'Plan & reflect on the day', '', NULL, 0 FROM standard WHERE lineage_id = 11;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 3, 'Journal', 'Even one minute counts.', NULL, 0 FROM standard WHERE lineage_id = 11;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 4, 'Set out tomorrow''s outfit', '', NULL, 0 FROM standard WHERE lineage_id = 11;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 5, 'Meditate — 30 minutes', '', NULL, 0 FROM standard WHERE lineage_id = 11;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 6, 'Read before bed', '', 'MTWT--S', 0 FROM standard WHERE lineage_id = 11;
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays, optional)
SELECT id, 7, 'Read or listen to a podcast', '', '----FS-', 0 FROM standard WHERE lineage_id = 11;
