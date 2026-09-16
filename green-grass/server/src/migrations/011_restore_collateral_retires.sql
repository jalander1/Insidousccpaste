-- Retiring a standard closed every live version on its lineage:
--
--   UPDATE standard SET effective_to = ? WHERE lineage_id = ? AND effective_to IS NULL
--
-- which was right when a lineage could only have one. With the objectives
-- sharing lineages 11, 12 and 13 with three standards added by hand, retiring
-- one of those standards silently retired the objective beside it. That is why
-- the Primary and Secondary objectives stopped appearing while the Tertiary
-- stayed: the lineage it shares was never retired.
--
-- Bring back only what was taken as collateral. The signature is exact — a
-- retire stamps the same effective_to on every row it closes, and an objective
-- that was never drawn on the Manage screen could not have been the one
-- clicked. A standard closed on its own is left alone: that was a real choice.
--
-- (Migration 010's unique index makes this impossible from here: a retire can
-- only ever find the one live version it was aimed at.)

CREATE TEMP TABLE revive AS
SELECT sid, (SELECT MAX(lineage_id) FROM standard) + ROW_NUMBER() OVER (ORDER BY sid) AS fresh
  FROM (
    SELECT s.id AS sid,
           ROW_NUMBER() OVER (PARTITION BY s.name ORDER BY s.effective_to DESC, s.id DESC) AS rn
      FROM standard s
     WHERE s.name IN ('Primary objective', 'Secondary objective', 'Tertiary objective')
       AND s.effective_to IS NOT NULL
       -- closed in the same stroke as another standard on the same lineage
       AND EXISTS (SELECT 1 FROM standard o
                    WHERE o.lineage_id = s.lineage_id
                      AND o.id <> s.id
                      AND o.effective_to = s.effective_to)
       -- and only where that objective has no living version left anywhere
       AND NOT EXISTS (SELECT 1 FROM standard l
                        WHERE l.name = s.name AND l.effective_to IS NULL)
  )
 WHERE rn = 1;

-- Reopened onto a lineage of its own, so restoring the standard it was retired
-- beside can never collide with it again.
UPDATE standard
   SET effective_to = NULL,
       lineage_id = (SELECT fresh FROM revive WHERE sid = standard.id)
 WHERE id IN (SELECT sid FROM revive);

DROP TABLE revive;

-- Put the sheet back in order: the objectives read straight after the morning
-- routine, and the numbers down the Manage list run without gaps.
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
