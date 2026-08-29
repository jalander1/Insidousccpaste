-- Friday and Saturday are the late shifts: home at one in the morning, phone
-- in the room, and a podcast does the job a book does on a quiet night.
-- The two reading steps are complementary — exactly one applies each night.

UPDATE routine_step SET weekdays = 'MTWT--S'
  WHERE standard_id IN (SELECT id FROM standard WHERE lineage_id = 9)
    AND name = 'Phone away downstairs';

UPDATE routine_step SET weekdays = 'MTWT--S'
  WHERE standard_id IN (SELECT id FROM standard WHERE lineage_id = 9)
    AND name = 'Read before bed';

INSERT INTO routine_step (standard_id, step_order, name, detail, weekdays)
SELECT id, 7, 'Read or listen to a podcast', '', '----FS-' FROM standard
 WHERE lineage_id = 9
   AND NOT EXISTS (
     SELECT 1 FROM routine_step rs
      WHERE rs.standard_id = standard.id AND rs.name = 'Read or listen to a podcast');
