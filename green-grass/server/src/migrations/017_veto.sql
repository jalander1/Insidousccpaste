-- One night off a week, and it costs nothing.
--
-- Friday and Saturday he gets in from the bar at one in the morning, and the
-- evening routine is still asked: phone off, plan, journal, outfit, sit. Five
-- things at 1am, twice a week, for six weeks of camp. Something has to give,
-- and the choice until now was to break the night and lose the run with it.
--
-- A veto is the third kind of "not asked", and the only one you spend:
--   released  the schedule never asked. Transparent to a run.
--   away      you blocked the days out. Ends the run — that is the point.
--   vetoed    you called it off, out of an allowance. Transparent to a run.
--
-- One a week, Monday to Sunday, use it or lose it. It does not make the night
-- kept; it makes the night not count, which is the honest answer to "I worked
-- until one and I am going to bed."

ALTER TABLE standard ADD COLUMN vetoes_per_week INTEGER NOT NULL DEFAULT 0;

CREATE TABLE veto (
  date       TEXT NOT NULL,
  lineage_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, lineage_id)
);

UPDATE standard SET vetoes_per_week = 1 WHERE name = 'Evening routine';
