-- Two bugs, one cause.
--
-- The objectives were introduced with fixed lineage ids (11, 12, 13), but a
-- standard added by hand takes MAX(lineage_id) + 1 — so anyone who had added
-- their own standards before that update ended up with two live standards
-- sharing a lineage. Nothing complained: the list is drawn from the lineage,
-- so one of the pair simply stopped being drawn, and an objective vanished
-- from Manage. Re-home the newer of each pair onto a free lineage, then make
-- the collision impossible rather than silent.
--
-- Marks are attached to the row (standard.id), not the lineage, so nothing
-- recorded moves. Exemptions are keyed by lineage, and every exemption on a
-- contested lineage predates the objectives — so the standard that was there
-- first keeps the lineage, and the objective is the one that moves.

CREATE TEMP TABLE relineage AS
SELECT s.id AS sid,
       (SELECT MAX(lineage_id) FROM standard) + ROW_NUMBER() OVER (ORDER BY s.id) AS fresh
  FROM standard s
 WHERE s.effective_to IS NULL
   AND EXISTS (SELECT 1 FROM standard o
                WHERE o.effective_to IS NULL
                  AND o.lineage_id = s.lineage_id
                  AND o.id < s.id);

UPDATE standard
   SET lineage_id = (SELECT fresh FROM relineage WHERE sid = standard.id)
 WHERE id IN (SELECT sid FROM relineage);

DROP TABLE relineage;

-- A lineage is one standard over time: it can have many versions, but only
-- ever one in force. Anything else is a bug, and should say so at the write
-- rather than quietly drop a row at the read.
CREATE UNIQUE INDEX standard_one_open ON standard (lineage_id)
  WHERE effective_to IS NULL;

-- The objectives are the needle movers, so they sit with the morning — read
-- straight after the routine rather than at the bottom of the sheet. Order is
-- presentation, not history, so every version of a standard moves together.
CREATE TEMP TABLE neworder AS
SELECT lineage_id, ROW_NUMBER() OVER (ORDER BY sortkey, display_order, lineage_id) AS pos
  FROM (
    SELECT lineage_id, display_order,
           CASE name
             WHEN 'Primary objective'   THEN morning + 0.1
             WHEN 'Secondary objective' THEN morning + 0.2
             WHEN 'Tertiary objective'  THEN morning + 0.3
             ELSE display_order * 1.0
           END AS sortkey
      FROM standard,
           (SELECT COALESCE((SELECT display_order FROM standard
                              WHERE effective_to IS NULL AND lineage_id = 2), 0) AS morning)
     WHERE effective_to IS NULL
  );

UPDATE standard
   SET display_order = (SELECT pos FROM neworder WHERE neworder.lineage_id = standard.lineage_id)
 WHERE lineage_id IN (SELECT lineage_id FROM neworder);

DROP TABLE neworder;
