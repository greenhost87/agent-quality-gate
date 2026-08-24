SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = $1
  AND pid <> pg_backend_pid()
