ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_halt_reason_check;

ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_halt_reason_check CHECK (halt_reason IN ('step_limit', 'invocation_limit', 'time_limit', 'approval_required', 'upstream_error', 'model_error', 'model_unsuitable'));

ALTER TABLE agent_run_steps DROP CONSTRAINT IF EXISTS agent_run_steps_kind_check;

ALTER TABLE agent_run_steps ADD CONSTRAINT agent_run_steps_kind_check CHECK (kind IN ('plan', 'preflight', 'invocation', 'refusal', 'halt'));
