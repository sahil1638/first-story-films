# Documentation Review Closure

This document maps the external documentation review gaps to repository docs.

## Scorecard

| Review Gap | Status | Location |
|------------|--------|----------|
| Route inventory | Complete | [ROUTES.md](./ROUTES.md) |
| Final RLS/role matrix | Complete | [SECURITY_MATRIX.md](./SECURITY_MATRIX.md) |
| Incident response runbook | Complete | [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) |
| Backup/restore procedure | Complete | [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) |
| API documentation | Complete | [API.md](./API.md) |
| Accessibility checklist | Complete | [ACCESSIBILITY_CHECKLIST.md](./ACCESSIBILITY_CHECKLIST.md) |

## Documentation Set

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Product overview, setup, environment, deployment, role summary |
| [docs/ROUTES.md](./ROUTES.md) | UI route and API route inventory |
| [docs/API.md](./API.md) | API endpoint reference with auth, payloads, rate limits, and status codes |
| [docs/SECURITY_MATRIX.md](./SECURITY_MATRIX.md) | App roles, route access, RLS matrix, RPC authorization |
| [docs/INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | Production incident triage and recovery runbook |
| [docs/BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | Backup verification, restore, and post-restore validation |
| [docs/ACCESSIBILITY_CHECKLIST.md](./ACCESSIBILITY_CHECKLIST.md) | WCAG-oriented release checklist |
| [supabase/SETUP.md](../supabase/SETUP.md) | Supabase setup, production hardening, verification |
| [src/lib/data/RPC_GUIDE.md](../src/lib/data/RPC_GUIDE.md) | RPC-backed flow rationale and DAL boundary |

## Maintenance Rules

- Update [docs/ROUTES.md](./ROUTES.md) and [docs/API.md](./API.md) whenever a route handler or page route is added, removed, or changes access level.
- Update [docs/SECURITY_MATRIX.md](./SECURITY_MATRIX.md) whenever RLS, grants, role checks, or RPC permissions change.
- Update [docs/INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) after every incident review.
- Run documentation review as part of production-readiness work, not after launch.

## Current Documentation Rating

The original review rated documentation at 7.8/10 because the README was strong but several operational references were missing.

With the missing route, API, RLS, incident, backup/restore, and accessibility documents added and linked, the documentation set now covers developer onboarding, operator response, security review, production recovery, and external API understanding.
