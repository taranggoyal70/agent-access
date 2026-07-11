CREATE TABLE IF NOT EXISTS design_partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  work_email text NOT NULL,
  role_title text NOT NULL,
  company_url text NOT NULL,
  api_spec_url text,
  agent_demand text NOT NULL,
  target_workflow text NOT NULL,
  timeline text NOT NULL,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','qualified','onboarding','active','committed','declined')),
  source text NOT NULL DEFAULT 'website',
  client_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_partner_status_created_idx ON design_partner_applications(status,created_at DESC);
CREATE INDEX IF NOT EXISTS design_partner_email_idx ON design_partner_applications(lower(work_email));
