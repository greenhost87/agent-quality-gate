SELECT name, setting
FROM pg_settings
WHERE name IN (
  'fsync',
  'synchronous_commit',
  'full_page_writes',
  'wal_level',
  'max_wal_senders'
)
ORDER BY name;
