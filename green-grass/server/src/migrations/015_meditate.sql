-- The morning sit loses its number.
--
-- Same reason TRE lost its fifteen minutes: a duration on the step turns the
-- practice into a quota, and a quota is a thing to fall short of. The sit
-- happens or it does not. How long it runs is between him and the morning.
--
-- The evening sit keeps its thirty: that one is a wind-down with a bedtime
-- after it, and the number is doing work there.

UPDATE routine_step SET name = 'Meditate'
 WHERE name = 'Meditate — 30 minutes'
   AND standard_id IN (
     SELECT id FROM standard WHERE lineage_id = 2 AND effective_to IS NULL);
