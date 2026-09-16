-- The 1% is its own thing, separate from the day's tasks: the one quality he
-- is deliberately doing better than yesterday.
ALTER TABLE day ADD COLUMN one_percent TEXT NOT NULL DEFAULT '';
ALTER TABLE day ADD COLUMN one_percent_status TEXT NOT NULL DEFAULT 'unset';
