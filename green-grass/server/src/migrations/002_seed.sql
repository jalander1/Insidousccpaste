-- The owner's actual standards.
-- weekdays: 7 chars, Mon..Sun. A letter means the standard applies; '-' means released.
-- effective_from is deliberately far in the past so backfilled dates still resolve.

INSERT INTO standard
  (id, lineage_id, display_order, name, definition, kind, weekdays, effective_from) VALUES
(1, 1, 1, 'Wake by 09:00',
 'Up by nine, Monday to Saturday. Sunday is the day of rest.',
 'binary', 'MTWTFS-', '2000-01-01'),

(2, 2, 2, 'Morning routine',
 'No phone until every step is done.',
 'checklist', 'MTWTFSS', '2000-01-01'),

(3, 3, 3, 'Content creation — 1 hour',
 'One hour minimum, directly moving the personal brand forward: ideation, scripts, planning the content week, filming, making. Not reading or study.',
 'binary', 'MTWTFS-', '2000-01-01'),

(4, 4, 4, 'Reading — 1 hour',
 'A book. Monday to Saturday.',
 'binary', 'MTWTFS-', '2000-01-01'),

(5, 5, 5, 'No porn or ejaculation',
 'No intentionally seeking sexually explicit content, Reddit included. Once is a fail.',
 'abstain', 'MTWTFSS', '2000-01-01'),

(6, 6, 6, 'No TV or films',
 'Monday to Saturday. Includes YouTube — clips of shows and films, and video essays. Sunday is open.',
 'abstain', 'MTWTFS-', '2000-01-01'),

(7, 7, 7, 'Instagram under 30 minutes',
 'For inspiration and for the brand, not for pleasure. Thirty minutes is the ceiling.',
 'abstain', 'MTWTFSS', '2000-01-01'),

(8, 8, 8, 'No phone or technology on the toilet',
 '',
 'abstain', 'MTWTFSS', '2000-01-01'),

(9, 9, 9, 'Evening routine',
 'Monday to Thursday, aim to begin at 22:30.',
 'checklist', 'MTWTFSS', '2000-01-01'),

(10, 10, 10, 'Weekly review & plan',
 'Saturday. Reflect on the week that went, then plan the week that comes.',
 'binary', '-----S-', '2000-01-01');

INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays) VALUES
(2, 1, 'Read', '', NULL),
(2, 2, 'Exercise session', 'Bag work, then the stretching and prehab/rehab circuit.', NULL),
(2, 3, 'TRE — 15 minutes', '', NULL),
(2, 4, 'Meditate — 45 minutes', '', NULL),

(9, 1, 'Phone away downstairs', '', 'MTWT--S'),
(9, 2, 'Plan & reflect on the day', '', NULL),
(9, 3, 'Journal', 'Even one minute counts.', NULL),
(9, 4, 'Set out tomorrow''s outfit', '', NULL),
(9, 5, 'Meditate — 30 minutes', '', NULL),
(9, 6, 'Read before bed', '', 'MTWT--S'),
(9, 7, 'Read or listen to a podcast', '', '----FS-');

INSERT INTO setting (key, value) VALUES ('schema_owner', 'green-grass');
