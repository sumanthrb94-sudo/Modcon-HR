# ModCon HR documentation

ModCon HR is an India-first HRMS for small and mid-sized companies: people records, attendance, leave, payroll preparation, expenses, recruitment and a company noticeboard. React + TypeScript on Vercel, with Firebase (Auth + Firestore) as the backend.

## Start here

| If you are… | Read |
| --- | --- |
| An employee or a manager using the app | [User guide](user-guide.md) |
| An HR Manager or Administrator setting up and running an organisation | [HR & admin guide](hr-admin-guide.md) |
| A developer working on the code | [Developer guide](developer-guide.md), then [`CLAUDE.md`](../CLAUDE.md) |
| Looking something up — roles, routes, collections, settings keys | [Reference](reference.md) |
| Preparing a release | [Launch readiness](launch-readiness.md) |

## Design specs

These explain *why* a part of the system is the way it is. Read the one for the area you are changing.

| Area | Spec |
| --- | --- |
| Product requirements | [PRD](PRD.md) · [India-first positioning](india-first-positioning.md) |
| Shared records and the Firestore/`localStorage` cache | [shared-records-spec](shared-records-spec.md) |
| Tenant isolation and rules for new collections | [tenant-isolation-spec](tenant-isolation-spec.md) · [multi-tenancy-spec](multi-tenancy-spec.md) |
| Who can read salary and leave | [salary-leave-access-spec](salary-leave-access-spec.md) |
| Geofenced attendance and check-in policy | [geofenced-attendance-spec](geofenced-attendance-spec.md) · [checkin-policy-spec](checkin-policy-spec.md) |
| Employee documents | [document-management-spec](document-management-spec.md) |

## Audits and walkthroughs

[Production UI audit, 2026-10-05](production-ui-audit-2026-10-05.md) · [Client walkthrough](client-walkthrough.html) ([PDF](ModCon-HR-Client-Walkthrough.pdf))

## Keeping these current

`CLAUDE.md` is the source for the reasoning behind each decision and is updated with every behaviour change; these guides summarise it for a reader who is not in the code. When you change what a screen does, update the relevant guide in the same commit — a guide that describes a screen that no longer works that way is worse than none.
