CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed'))
);

CREATE INDEX orders_status_idx ON orders (status);
