-- The day's own objectives: what he set out to do, from his notepad. Worth as
-- much as a standing standard, because these are what move him forward.
CREATE TABLE objective (
  date   TEXT NOT NULL,
  tier   TEXT NOT NULL CHECK (tier IN ('primary','secondary','tertiary')),
  text   TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unset' CHECK (status IN ('unset','hit','missed')),
  PRIMARY KEY (date, tier)
);
