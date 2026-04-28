# 0011 — Hosted instance (Deferred)

- **Status:** Deferred
- **Date:** 2026-04-30
- **Deciders:** @jvrmaia

## Context

`chatlab` is local-first by design (see [ADR 0003](./0003-distribution-channels.md)). A recurring question in dev-tool projects is: should the project also run a **hosted instance** — a public URL anyone can point an agent at without installing anything — for sales demos, hackathons, "try it now" landing pages, and CI-of-CIs use?

Without a recorded position the same proposal will surface every few months: an issue, a Discord thread, a contributor offering to "just spin up a t3.small". Re-litigating each time burns maintainer time.

## Decision

**We deliberately defer running a hosted chatlab instance** to a later milestone. No hosted instance exists, none is planned, and PRs proposing one will be closed pointing here.

The decision is **deferred, not rejected** — meaning the door stays open if the criteria below are met. Until then, the project stays local-only.

### Reopening criteria

We reconsider this ADR when **any two** of the following are true:

1. **Demand signal:** ≥ 25 GitHub issues / Discord posts / direct asks within a 90-day window with the request "I wish I could try this without installing".
2. **SLA target:** a project sponsor commits to underwriting at least one full-time SRE-on-call rotation for the hosted service.
3. **Funding:** a non-time-bound funding source (sponsorship, grant, paid tier) covers the projected hosting cost for ≥ 12 months. No bootstrap-from-pocket.
4. **Multi-tenancy plan:** a credible technical plan for safe multi-tenant operation exists — agents from different users cannot see each other's chats, exports, or feedback corpora; rate-limit isolation; abuse mitigation.
5. **Legal review:** a fresh legal opinion clears running chatlab as a public service, especially around storing third-party API keys and per-user agent traffic.

When two criteria are satisfied, write a new ADR superseding this one. Until then, the answer to "can we host it?" is: **no, by deliberate design choice — see ADR 0011**.

## Consequences

- **Positive:** maintainers can point at this ADR instead of re-arguing every quarter. Project focus stays on the local-first product.
- **Positive:** we are not on the hook for uptime, abuse handling, or PII residency for a hosted multi-tenant service we don't currently have the bandwidth to run safely.
- **Negative:** people who want to try chatlab without installing have to use the npm or Docker channel locally. Acceptable cost; both channels keep "trial friction" low enough.
- **Negative:** competitors with hosted instances may capture some user share that drops out at "I have to install something". Acceptable; that user share is also more likely to churn off our local-first proposition.

## Alternatives considered

- **Run a hosted instance now (community-funded)** — rejected. Operational debt + abuse risk + multi-tenant safety problems we are not staffed for.
- **Run a hosted instance only for demos (controlled rollout)** — rejected. "Just for demos" routinely becomes "production" without anyone signing up to run it. Ask any maintainer with a `staging.example.com` history.
- **Partner with a third-party cloud lab to host it** — kept open as a possibility under reopening criterion #3, but not commissioned proactively.
- **Reject permanently (`Status: Rejected`)** — rejected. Conditions may legitimately change; deferring is honest.
