-- Minimal runtime surface for managed database preset integration tests.

CREATE TABLE runtime_items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO runtime_items (name) VALUES ('seed');
