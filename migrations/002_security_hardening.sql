ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_sandbox_id_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS executions_agent_idempotency_idx ON executions(agent_account_id, idempotency_key);

CREATE TABLE IF NOT EXISTS registration_windows (
  sandbox_id uuid NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  client_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (sandbox_id, client_key, window_start)
);
