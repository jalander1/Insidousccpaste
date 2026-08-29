-- Versioned standard definitions. Editing closes a row and opens a new one.
CREATE TABLE standard (
  id            INTEGER PRIMARY KEY,
  lineage_id    INTEGER NOT NULL,
  display_order INTEGER NOT NULL,
  name          TEXT NOT NULL,
  definition    TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL CHECK (kind IN ('binary','abstain','checklist')),
  weekdays      TEXT NOT NULL,
  applies_on_rest TEXT NOT NULL DEFAULT 'schedule'
                  CHECK (applies_on_rest IN ('schedule','always','never')),
  applies_on_work TEXT NOT NULL DEFAULT 'schedule'
                  CHECK (applies_on_work IN ('schedule','always','never')),
  effective_from  TEXT NOT NULL,
  effective_to    TEXT
);
CREATE INDEX standard_lineage ON standard (lineage_id, effective_from);

CREATE TABLE routine_step (
  id          INTEGER PRIMARY KEY,
  standard_id INTEGER NOT NULL REFERENCES standard(id),
  step_order  INTEGER NOT NULL,
  name        TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  weekdays    TEXT
);
CREATE INDEX routine_step_standard ON routine_step (standard_id, step_order);

CREATE TABLE day (
  date            TEXT PRIMARY KEY,
  day_type        TEXT NOT NULL DEFAULT 'auto'
                  CHECK (day_type IN ('auto','normal','work','rest')),
  note            TEXT NOT NULL DEFAULT '',
  prompt_answered TEXT NOT NULL DEFAULT ''
);

CREATE TABLE mark (
  date        TEXT NOT NULL,
  standard_id INTEGER NOT NULL REFERENCES standard(id),
  status      TEXT NOT NULL CHECK (status IN ('kept','broken')),
  reason      TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (date, standard_id)
);

CREATE TABLE step_check (
  date    TEXT NOT NULL,
  step_id INTEGER NOT NULL REFERENCES routine_step(id),
  checked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, step_id)
);

CREATE TABLE exemption (
  date       TEXT NOT NULL,
  lineage_id INTEGER NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, lineage_id)
);

CREATE TABLE flag_def (
  id     INTEGER PRIMARY KEY,
  label  TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE day_flag (
  date    TEXT NOT NULL,
  flag_id INTEGER NOT NULL REFERENCES flag_def(id),
  PRIMARY KEY (date, flag_id)
);

CREATE TABLE week (
  week_start  TEXT PRIMARY KEY,
  priority_1  TEXT NOT NULL DEFAULT '',
  priority_2  TEXT NOT NULL DEFAULT '',
  priority_3  TEXT NOT NULL DEFAULT '',
  one_percent TEXT NOT NULL DEFAULT '',
  review      TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT
);

CREATE TABLE month (
  month       TEXT PRIMARY KEY,
  goals       TEXT NOT NULL DEFAULT '[]',
  working_on  TEXT NOT NULL DEFAULT '',
  review      TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
