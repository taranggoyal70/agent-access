CREATE TABLE IF NOT EXISTS import_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('url', 'file', 'paste', 'sample')),
  source_url text,
  spec_hash text NOT NULL,
  openapi_version text NOT NULL,
  source_spec jsonb NOT NULL,
  proposed_capabilities jsonb NOT NULL,
  analysis jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE (project_id, revision_number),
  UNIQUE (project_id, spec_hash)
);

CREATE TABLE IF NOT EXISTS vendor_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'staging' CHECK (environment = 'staging'),
  origin text NOT NULL,
  auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'bearer', 'api_key')),
  header_name text,
  secret_ciphertext text,
  secret_iv text,
  secret_tag text,
  status text NOT NULL DEFAULT 'untested' CHECK (status IN ('untested', 'active', 'failed', 'revoked')),
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE executions ADD COLUMN IF NOT EXISTS upstream boolean NOT NULL DEFAULT false;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS upstream_origin text;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS response_hash text;
ALTER TABLE executions ADD COLUMN IF NOT EXISTS response_bytes integer;

CREATE INDEX IF NOT EXISTS import_revisions_project_created_idx ON import_revisions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS executions_upstream_created_idx ON executions(upstream, created_at DESC) WHERE upstream;
