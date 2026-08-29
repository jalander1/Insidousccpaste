-- The owner's actual standards (ARCHITECTURE.md §5).
-- weekdays: 7 chars, Mon..Sun. A letter means the standard applies; '-' means released.
-- effective_from is deliberately far in the past so backfilled dates still resolve.

INSERT INTO standard
  (id, lineage_id, display_order, name, definition, kind, weekdays, effective_from) VALUES
(1, 1, 1, 'Wake by 09:00',
 'Up by nine, Monday to Saturday. Sunday is the day of rest — no alarm, sleep in. This is the standard everything else hangs off: the day is either started on time or it is not.',
 'binary', 'MTWTFS-', '2000-01-01'),

(2, 2, 2, 'Morning routine, phone off until done',
 'The routine runs unbroken from waking to finish, roughly 11:00–11:30. No phone until every step is done — that is part of the standard, not a separate rule. Not fasted: juice throughout.',
 'checklist', 'MTWTFS-', '2000-01-01'),

(3, 3, 3, 'Content creation — 1 hour',
 'One hour minimum of work that directly moves the personal brand forward: ideation, writing a script, planning the content week, reflecting on content, or making the thing itself. It does not count if it belongs to the wider life — reading, studying Jung, drafting a five-year vision. Sunday is Sabbath.',
 'binary', 'MTWTFS-', '2000-01-01'),

(4, 4, 4, 'Reading — 1 hour',
 'A book, one hour. Monday to Saturday.',
 'binary', 'MTWTFS-', '2000-01-01'),

(5, 5, 5, 'No porn or masturbation',
 'No intentionally seeking sexually explicit content — Reddit included. No masturbation. Once is a fail. Every day, no exceptions, no released days.',
 'abstain', 'MTWTFSS', '2000-01-01'),

(6, 6, 6, 'No TV or films',
 'Monday to Saturday. Includes YouTube — clips of shows and films, and video essays. Educational content is allowed, but not as escape. Sunday is open.',
 'abstain', 'MTWTFS-', '2000-01-01'),

(7, 7, 7, 'Instagram under 30 minutes',
 'For inspiration and for the brand, not for pleasure. Thirty minutes is the ceiling. Check the screen-time report and answer honestly — the number itself is never typed in here.',
 'abstain', 'MTWTFSS', '2000-01-01'),

(8, 8, 8, 'No phone or technology on the toilet',
 'It is five minutes. Go, and come back.',
 'abstain', 'MTWTFSS', '2000-01-01'),

(9, 9, 9, 'Evening routine (from 22:30)',
 'Aim to begin at 22:30, every day — work evenings included. Fill the water bottle and add salt on the way; that is part of the routine but not something to score.',
 'checklist', 'MTWTFSS', '2000-01-01'),

(10, 10, 10, 'Weekly review & plan',
 'Saturday. Reflect on the week that went, then plan the week that comes: the three priorities and where to be 1% better.',
 'binary', '-----S-', '2000-01-01');

INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays) VALUES
(2, 1, 'Read', '', NULL),
(2, 2, 'Exercise session', 'Bag work, then the set stretching and prehab/rehab circuit. Edit this text to name the exact circuit.', NULL),
(2, 3, 'TRE — 15 minutes', 'Trauma release exercise.', NULL),
(2, 4, 'Meditate — 45 minutes', 'Phone stays away until this is finished.', NULL),

(9, 1, 'Phone away downstairs', 'No more phone after 22:30.', NULL),
(9, 2, 'Plan & reflect on the day', 'What happened today, what is the plan for tomorrow. Not required on Saturday night — Sunday needs no plan.', 'MTWTF-S'),
(9, 3, 'Journal', 'Even one minute counts. Every day without fail.', NULL),
(9, 4, 'Set out tomorrow''s outfit', '', NULL),
(9, 5, 'Meditate — 30 minutes', 'Before bed.', NULL);

INSERT INTO flag_def (id, label, active) VALUES
(1, 'Made up the fluid 30 minutes of meditation today', 1),
(2, 'Sexual content came through my feed today', 1),
(3, 'Something I watched or read was escape, not interest', 1);

INSERT INTO setting (key, value) VALUES ('schema_owner', 'the-rule');
