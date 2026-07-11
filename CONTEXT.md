# Agent Access

This context defines how a SaaS product recognizes, authorizes, meters, and audits external AI agents as first-class customers acting under human or organizational authority.

## Participants

**Initial Customer**:
A developer-first B2B SaaS Vendor with 10–200 employees, an existing REST or OpenAPI surface, and customer demand for MCP or agent access.
_Avoid_: Enterprise incumbent, consumer app, pre-product founder, generic API company

**Buyer**:
The CTO or VP Engineering at an Initial Customer who owns the decision to provide secure agent access.
_Avoid_: Developer, Agent Customer, security reviewer

**Champion**:
The API or platform engineering lead at an Initial Customer who evaluates and implements Agent Access.
_Avoid_: Buyer, end user, Agent Customer

**Design Partner**:
An Initial Customer that provides a real API contract and one concrete external-agent workflow, uses the Agent Sandbox repeatedly, and gives implementation feedback. Interest, an introduction, or a product demo alone does not make an organization a Design Partner.
_Avoid_: Investor, advisor, event attendee, interview participant, friendly contact

**SaaS Vendor**:
An organization that exposes product capabilities to external Agent Customers through Agent Access.
_Avoid_: Tool provider, marketplace seller, agent developer

**Principal**:
A person or organization that grants authority to an Agent Customer and remains accountable for its actions.
_Avoid_: Agent, end user, credential

**Agent Customer**:
An external software agent that discovers and uses a SaaS Vendor on behalf of a Principal.
_Avoid_: Bot account, service account, employee agent

**Delegation**:
A time-bounded grant from a Principal defining which SaaS Vendor capabilities an Agent Customer may use, against which resources, and within what limits.
_Avoid_: API key, role, unrestricted consent

## Product surface

**Capability**:
A machine-readable action or resource operation offered by a SaaS Vendor to Agent Customers.
_Avoid_: UI feature, prompt, raw endpoint

**Agent Account**:
The SaaS Vendor identity representing one Agent Customer and its relationship to a Principal. An Agent Account may hold many Delegations over time.
_Avoid_: Human account, shared service account, API key

**Agent Credential**:
A short-lived, scoped secret issued to one Agent Account under one active Delegation.
_Avoid_: Permanent API key, user password, shared token

**Execution Receipt**:
A tamper-evident record of a Capability invocation, the Agent Account and Principal authority used, the applicable policy decision, and the resulting effect.
_Avoid_: Console log, model reasoning, invoice

**Sandbox Account**:
An isolated Agent Account with synthetic or disposable resources for programmatic product evaluation.
_Avoid_: Production tenant, demo screenshot, shared test login

**OpenAPI Import**:
The ingestion of a SaaS Vendor's OpenAPI document to propose Agent Capabilities and their schemas. Importing does not publish or authorize any Capability by itself.
_Avoid_: Live integration, unrestricted proxy, code generation only

**Import Revision**:
An immutable, validated version of an OpenAPI Import that can be compared with earlier revisions before a Champion applies its Capability changes.
_Avoid_: Silent overwrite, published sandbox version, mutable draft document

**Agent Sandbox**:
The published machine-facing environment produced after a Champion reviews an OpenAPI Import, configures policies and boundaries, and activates Sandbox Accounts.
_Avoid_: API documentation site, production tenant, mock UI

**Shadow Mode**:
A Design Partner evaluation in which Agent Access mediates approved read-only Capabilities against the SaaS Vendor's staging environment while preventing mutating operations.
_Avoid_: Synthetic sandbox, production write access, passive logging only

**Vendor Connection**:
The revocable relationship that permits Agent Access to invoke approved Capabilities against one SaaS Vendor environment without exposing the vendor's upstream authority to an Agent Customer.
_Avoid_: Agent Credential, Delegation, unrestricted proxy, shared customer secret

**Capability Policy**:
The rule attached to a Capability that classifies its effect and determines whether it is allowed, denied, limited, or requires Principal approval.
_Avoid_: Prompt instruction, UI warning, generic role

## Example dialogue

**Agent Customer:** “Can I create a production workspace for this Principal?”

**SaaS Vendor:** “Your Agent Credential only permits creating resources inside the Sandbox Account. Request a broader Delegation from the Principal.”

**Principal:** “Allow this Agent Customer to create projects for seven days, but not delete or invite users.”

**SaaS Vendor:** “The Delegation is active. Every Capability invocation will produce an Execution Receipt.”

**Champion:** “I imported our OpenAPI file. Can agents call every endpoint now?”

**SaaS Vendor:** “No. The OpenAPI Import only proposes Capabilities. You must select them, define each Capability Policy, map tenant boundaries, and publish the Agent Sandbox.”
