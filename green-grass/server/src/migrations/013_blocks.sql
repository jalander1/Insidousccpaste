-- Time away, and what does not take holidays.
--
-- An exception used to be one standard on one day, which is no use for a week
-- in Italy. A block is a date range with an optional standard: leave the
-- standard off and it covers the whole sheet; name one and it is the old
-- single-day exception, which is just a block of length one. One object, one
-- screen, instead of two mechanisms that nearly do the same thing.
--
-- A pinned standard does not take holidays. It keeps being asked inside a
-- block, keeps being tickable, and keeps its run. Everything else is greyed
-- out for those days.
--
-- The run is the thing that changes. A release you *chose* — a block, an
-- exception — now ends a run, because you did not keep the standard and the
-- record should say so. A release the schedule made is still transparent:
-- Sunday cannot break a Monday-to-Saturday run, and a Saturday-only standard
-- would otherwise never get past one.

ALTER TABLE standard ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE TABLE block (
  id         INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  -- NULL covers every standard that is not pinned.
  lineage_id INTEGER,
  reason     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX block_range ON block (start_date, end_date);

-- Every exception already set becomes a one-day block on that standard.
INSERT INTO block (start_date, end_date, lineage_id, reason, created_at)
SELECT date, date, lineage_id, reason, datetime('now') FROM exemption;

DROP TABLE exemption;

-- This one does not take holidays.
UPDATE standard SET pinned = 1 WHERE name = 'No porn or ejaculation';
