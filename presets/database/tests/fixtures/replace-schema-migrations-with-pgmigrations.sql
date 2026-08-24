DROP TABLE IF EXISTS schema_migrations;

CREATE TABLE pgmigrations (
  id serial4 NOT NULL,
  "name" varchar(255) NOT NULL,
  run_on timestamp NOT NULL,
  CONSTRAINT pgmigrations_id_not_null NOT NULL id,
  CONSTRAINT pgmigrations_name_not_null NOT NULL name,
  CONSTRAINT pgmigrations_run_on_not_null NOT NULL run_on,
  CONSTRAINT pgmigrations_pkey PRIMARY KEY (id)
);

INSERT INTO pgmigrations (name, run_on)
VALUES ('000001-runtime', NOW());
