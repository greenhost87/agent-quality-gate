await client.unsafe(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id serial4 NOT NULL,
    "name" varchar(255) NOT NULL,
    run_on timestamp NOT NULL,
    CONSTRAINT schema_migrations_id_not_null NOT NULL id,
    CONSTRAINT schema_migrations_name_not_null NOT NULL name,
    CONSTRAINT schema_migrations_run_on_not_null NOT NULL run_on,
    CONSTRAINT schema_migrations_pkey PRIMARY KEY (id)
  )
`);
