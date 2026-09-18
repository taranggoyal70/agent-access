CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sandbox_id uuid NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  agent_account_id uuid REFERENCES agent_accounts(id) ON DELETE SET NULL,
  goal text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'halted', 'failed')),
  halt_reason text CHECK (halt_reason IN ('step_limit', 'invocation_limit', 'time_limit', 'approval_required', 'upstream_error', 'model_error')),
  allow_writes boolean NOT NULL DEFAULT false,
  max_steps integer NOT NULL DEFAULT 8 CHECK (max_steps BETWEEN 1 AND 40),
  max_invocations integer NOT NULL DEFAULT 12 CHECK (max_invocations BETWEEN 1 AND 100),
  deadline_ms integer NOT NULL DEFAULT 120000 CHECK (deadline_ms BETWEEN 1000 AND 600000),
  step_count integer NOT NULL DEFAULT 0,
  invocation_count integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  final_text text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS agent_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan', 'invocation', 'refusal', 'halt')),
  operation_id text,
  idempotency_key text,
  receipt_id text,
  status_code integer,
  policy text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index, kind, operation_id)
);

CREATE INDEX IF NOT EXISTS agent_runs_org_started_idx ON agent_runs (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_run_steps_run_idx ON agent_run_steps (run_id, step_index);
