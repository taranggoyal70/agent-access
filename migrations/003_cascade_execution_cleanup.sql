ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_capability_id_fkey;
ALTER TABLE executions ADD CONSTRAINT executions_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE;
