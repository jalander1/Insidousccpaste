-- The weekend morning is the meditation and nothing else.
--
-- The routine was one gate with a ninety-minute price on it, and the phone
-- rule was bolted to the far end — so the bargain on waking was an hour and a
-- half before you could even look at your phone. Monday to Friday that is
-- fine; he gets into a flow with it. By Saturday, after a week of pushing, it
-- was the thing keeping him in bed.
--
-- So the steps keep their own weekdays, the way the evening routine already
-- swaps the book for a podcast on the late shifts. Read, the exercises and
-- TRE run Monday to Friday. The meditation runs every day, and on Saturday
-- and Sunday it is the whole routine.
--
-- Two things fall out of it. The phone rule reprices itself — half an hour on
-- a weekend instead of ninety minutes — without the rule having to weaken.
-- And the heaviest day of the week stops being the most likely place for a
-- run to break: a light Saturday is still a kept Saturday.
--
-- Only the morning routine's steps are touched here. Everything else is left
-- exactly as it is found, including any standards edited by hand since.

UPDATE routine_step SET weekdays = 'MTWTF--'
 WHERE name IN ('Read', 'Exercises', 'Full exercise session', 'TRE')
   AND standard_id IN (
     SELECT id FROM standard WHERE lineage_id = 2 AND effective_to IS NULL);

-- Said plainly, because in three weeks the question will be what Saturday means.
UPDATE routine_step SET detail = 'Monday to Friday. Stretching flow, yoga set, 90/90s, breaststroke, quad stretch, band holds.'
 WHERE name = 'Exercises'
   AND standard_id IN (
     SELECT id FROM standard WHERE lineage_id = 2 AND effective_to IS NULL);

-- The meditation is the one that holds every day; make sure nothing has
-- narrowed it.
UPDATE routine_step SET weekdays = NULL
 WHERE name = 'Meditate — 30 minutes'
   AND standard_id IN (
     SELECT id FROM standard WHERE lineage_id = 2 AND effective_to IS NULL);
