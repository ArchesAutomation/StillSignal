# Process OS 2 implementation map

Baseline: `18b1483` on main. Work branch: `codex/trading-process-os-2`.

The process domain already provides immutable revisions, owner-scoped IndexedDB,
authenticated append validation, SQL reference/ownership checks, protocols, runs,
theses, variables, playbooks, assessments, missions and audits. Extend these records;
do not create another domain store. The October 29 migration stores validated JSON
bodies, so additive optional body fields do not require a new table or migration.

| Release | Reuse | Gaps to address |
| --- | --- | --- |
| 1 | pre-market workspace, template import/export, verificationEvidence | Structured applicability, direct compact start, duplicate/reorder controls |
| 2 | thesis revisions, weekly inheritance, Lightweight Charts | Bias matrix, scenario cards, version-pinned annotation metadata |
| 3 | playbook editor, planned assessments, manual execution links | Evidence coverage threshold, decision context |
| 4 | stable module portals, free-position board, layout revisions | Portable modes without remounting children; conflict-safe saves |
| 5 | sessions, immutable records, physiology engine | Unified recorded-time replay with explicit gaps |
| 6 | Patterns compare/regression, mission progress | Evidence-linked mission creation and longitudinal process view |

Existing tests cover process domain, server routes, production integration, storage,
database ownership, module board, journal undo and ingestion. Run these before and
after changes. Production and the remote migration ledger have not been modified.

## Compatibility and release

New fields must be optional for legacy records. Deploy server validators with the
client. Older validators reject new optional fields; preserve/export records before
rolling back to an older server. Never rewrite historical records to downgrade them.
No production deployment or migration application is authorized by this task.
