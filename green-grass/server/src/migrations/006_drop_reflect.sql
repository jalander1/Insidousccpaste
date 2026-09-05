-- The Claude chat was tried and removed. Clean up after it, whether or not
-- its migration ever ran on this database, and leave no API key behind.
DROP TABLE IF EXISTS chat_message;
DELETE FROM setting WHERE key = 'anthropic_api_key';
