-- A single official order may cover several employees.  Keep the original
-- person_id on official_orders as the legacy primary member so existing data
-- and callers remain valid while membership becomes the authoritative set.
CREATE TABLE IF NOT EXISTS official_order_members (
  official_order_id text NOT NULL REFERENCES official_orders(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (official_order_id, person_id)
);

INSERT INTO official_order_members (official_order_id, person_id)
SELECT id, person_id
FROM official_orders
ON CONFLICT (official_order_id, person_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS official_order_members_person_order_idx
  ON official_order_members (person_id, official_order_id);
