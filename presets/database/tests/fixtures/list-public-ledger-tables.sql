SELECT class.relname AS name
FROM pg_catalog.pg_class AS class
INNER JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
WHERE
  namespace.nspname = 'public'
  AND class.relkind = 'r'
  AND class.relname IN ('pgmigrations', 'schema_migrations')
ORDER BY class.relname
