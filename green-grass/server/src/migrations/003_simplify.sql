-- Trims the standards to what is actually kept, and drops the machinery that
-- turned a standard tracker into a goal setter. Updates rows in place rather
-- than versioning them: this is a correction of wording, not a change of
-- standard, and every mark already made stays attached.

UPDATE standard SET
  definition = 'Up by nine, Monday to Saturday. Sunday is the day of rest.'
  WHERE lineage_id = 1;

-- The morning routine is the same every day, Sunday included.
UPDATE standard SET
  name = 'Morning routine',
  definition = 'No phone until every step is done.',
  weekdays = 'MTWTFSS'
  WHERE lineage_id = 2;

UPDATE standard SET
  definition = 'One hour minimum, directly moving the personal brand forward: ideation, scripts, planning the content week, filming, making. Not reading or study.'
  WHERE lineage_id = 3;

UPDATE standard SET definition = 'A book. Monday to Saturday.' WHERE lineage_id = 4;

UPDATE standard SET
  name = 'No porn or ejaculation',
  definition = 'No intentionally seeking sexually explicit content, Reddit included. Once is a fail.'
  WHERE lineage_id = 5;

UPDATE standard SET
  definition = 'Monday to Saturday. Includes YouTube — clips of shows and films, and video essays. Sunday is open.'
  WHERE lineage_id = 6;

UPDATE standard SET
  definition = 'For inspiration and for the brand, not for pleasure. Thirty minutes is the ceiling.'
  WHERE lineage_id = 7;

UPDATE standard SET definition = '' WHERE lineage_id = 8;

UPDATE standard SET
  name = 'Evening routine',
  definition = 'Monday to Thursday, aim to begin at 22:30.'
  WHERE lineage_id = 9;

UPDATE standard SET
  definition = 'Saturday. Reflect on the week that went, then plan the week that comes.'
  WHERE lineage_id = 10;

-- Trim the step details down to the ones that say something.
UPDATE routine_step SET detail = 'Bag work, then the stretching and prehab/rehab circuit.'
  WHERE standard_id IN (SELECT id FROM standard WHERE lineage_id = 2)
    AND name = 'Exercise session';
UPDATE routine_step SET detail = ''
  WHERE standard_id IN (SELECT id FROM standard WHERE lineage_id = 2)
    AND name IN ('TRE — 15 minutes', 'Meditate — 45 minutes');

-- Planning and reflecting happens every night, not Monday to Friday.
UPDATE routine_step SET weekdays = NULL, detail = ''
  WHERE standard_id IN (SELECT id FROM standard WHERE lineage_id = 9)
    AND name = 'Plan & reflect on the day';
UPDATE routine_step SET detail = ''
  WHERE standard_id IN (SELECT id FROM standard WHERE lineage_id = 9)
    AND name IN ('Phone away downstairs', 'Meditate — 30 minutes');

-- Reading before bed, after the sit.
INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays)
SELECT id, 6, 'Read before bed', '', NULL FROM standard WHERE lineage_id = 9
  AND NOT EXISTS (
    SELECT 1 FROM routine_step rs
     WHERE rs.standard_id = standard.id AND rs.name = 'Read before bed');

-- Noticed-not-scored flags are gone from the app; keep the rows, stop asking.
UPDATE flag_def SET active = 0;
