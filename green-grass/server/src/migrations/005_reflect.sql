-- A place to think out loud about the record, kept alongside it.
CREATE TABLE chat_message (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL,          -- the day the conversation belongs to
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX chat_message_date ON chat_message (date, id);
