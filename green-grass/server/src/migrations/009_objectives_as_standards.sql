-- Hitting his objectives is itself a standard, and the tasks themselves live
-- in his notepad — so the objectives stop being a separate machine with its
-- own text boxes and become three more rows in the same ledger, carrying more
-- weight because they are what moves him forward.

ALTER TABLE standard ADD COLUMN points INTEGER NOT NULL DEFAULT 10;

INSERT INTO standard
  (lineage_id, display_order, name, definition, kind, weekdays, points, effective_from) VALUES
(11, 11, 'Primary objective',
 'The first task you set yourself today. Written in the notepad, ticked here.',
 'binary', 'MTWTFSS', 20, '2000-01-01'),
(12, 12, 'Secondary objective', '', 'binary', 'MTWTFSS', 12, '2000-01-01'),
(13, 13, 'Tertiary objective', '', 'binary', 'MTWTFSS', 8, '2000-01-01');

-- Carry over anything already ticked under the old scheme.
INSERT OR IGNORE INTO mark (date, standard_id, status, reason, updated_at)
SELECT o.date, s.id,
       CASE o.status WHEN 'hit' THEN 'kept' ELSE 'broken' END, '', datetime('now')
  FROM objective o
  JOIN standard s ON s.lineage_id = CASE o.tier
         WHEN 'primary' THEN 11 WHEN 'secondary' THEN 12 ELSE 13 END
 WHERE o.status IN ('hit', 'missed');

DROP TABLE objective;
