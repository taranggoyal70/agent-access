# Security model

## Implemented controls

- Clerk protects all human control-plane routes.
- Every control-plane database query is scoped to the current organization.
- Raw agent credentials are returned once and never persisted; only SHA-256 hashes and non-secret prefixes are stored.
- Agent credentials and delegations expire after one hour in the sandbox.
- Credential, delegation, account, sandbox, and capability status are rechecked on every invocation.
- Invocation idempotency is scoped to the authenticated agent account.
- Registrations and invocations are rate-limited in Postgres.
- Prohibited operations are never published or executable.
- Signed receipt verification uses canonical JSON, HMAC-SHA256, and constant-time comparison.
- Security-relevant imports, policy updates, publication, registrations, and executions write audit events.
- Public receipt verification exposes the receipt evidence, not a bearer credential.

## Threats outside this MVP

- Production forwarding to a vendor API requires connector-specific secret isolation, outbound allowlists, and reconciliation.
- HMAC is suitable for a single service verifier; independently verifiable receipts should migrate to asymmetric signing with managed key rotation.
- Enterprise deployments will need SSO/SAML, SCIM, configurable retention, regional data controls, and exportable audit streams.
- Postgres rate limits are correct but not globally optimized; high-volume deployments should use a dedicated distributed limiter.

## Reporting

Do not place credentials or customer OpenAPI documents in public issues. Revoke affected credentials and rotate server secrets if exposure is suspected.
