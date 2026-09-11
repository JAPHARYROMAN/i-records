# I-RECORDS architecture

I-RECORDS preserves manually reported activity, supporting evidence, and the history of review. It does not issue invoices, operate tills, process payments, calculate accounting profit, or manage live inventory.

## Organization and access

The initial organization contains ITEMBA GROUP and three companies: Mwanjalisi Oil, Itemba Enterprises, and Westsides. There are no seeded divisions, branches, transactions, or staff. The first authenticated visitor to the owner-private deployment initializes the organization and becomes group administrator. Complete this before expanding the site's access policy.

Company → Division → Branch ancestry is validated server-side. Branch/division parent changes are blocked to preserve historical classification. Records also preserve the names of their owning units in a scope snapshot. Company-wide records are supported without branches.

Authentication is provided by the hosting platform's ChatGPT sign-in. The application binds preassigned email access to a stable authenticated user ID. Every API operation enforces both scope and action permissions. Client selection is never authority. The upstream dispatcher must strip untrusted identity headers; this Worker must not be exposed directly without that trusted boundary. Local sign-in simulation is restricted to loopback and excluded from production builds.

Roles are administrator, records officer, reviewer, and viewer. Users can have multiple scoped assignments. Administration does not imply review permission. Authors cannot approve or return their own submissions. Access assignment does not send email.

## Persistence

- React 19 and TypeScript through the Vinext/Vite application framework.
- Cloudflare D1 stores structured records and metadata through prepared SQL statements.
- R2 stores original document bytes under unguessable object keys. Downloads require authenticated scope checks.
- Drizzle owns schema migrations; additional schema-only SQL triggers enforce historical integrity.
- Browser storage is not the authority for business data.

Monetary amounts use integer minor units. Report sums are serialized as strings and formatted using BigInt to avoid JavaScript precision loss. Currencies are never added together. SQLite's signed 64-bit aggregate ceiling remains a storage limit; very large aggregate overflow fails rather than returning an invented value.

## Record lifecycle

Draft → Submitted → Approved, with return/resubmit and author withdrawal before a decision. Submitted records are locked. Official summary values include only effective approved records. Correcting an approved record creates a replacement draft and keeps the original effective until the replacement is approved. Approval uses version compare-and-swap, guards the original version, and supersedes the original in one database batch. Both record versions and audit snapshots remain available.

Record creation is idempotent using the client-generated primary key. Updates and decisions require the current version. Database triggers protect approved facts, audit history, hierarchy relationships, period closure, and evidence ownership at commit time.

Sales, purchases, expenses, invoices, payments, and collections are separately classified. Invoices and settlements do not add to sales or cost metrics. Linking records does not duplicate amounts. A unit/currency cannot have overlapping approved sales periods. The first release records one sales summary per unit/currency/period; shift detail belongs within that summary.

## Documents and reporting

Uploads accept PDF, PNG, and JPEG with extension/signature checks and a 20 MB limit. Original bytes and SHA-256 are retained. Fingerprints prove byte consistency, not document authenticity. Original metadata is immutable; additional evidence is a new document with its own history. Documents can be linked to several records in the same exact organizational scope. Documents and financial approval are separate: an authorized reviewer must explain approval without attached evidence.

Historical filters use business dates and show the latest recorded history. Summary records overlapping a range remain visible with their original interval, but their amounts are excluded from narrower-range summary totals. No invented daily distribution is produced. CSV exports contain version, approval time, and export time, and are audited. Downloaded exports are the issued snapshot; a server-held report snapshot catalogue is not implemented yet.

Reporting expectations are optional, have effective start/end dates, and apply at company, division, or branch level. Reviews shows each rule's latest completed calendar period. An exact-period approved record satisfies it; daily entries are not silently assumed to satisfy a weekly/monthly summary obligation. No expectation means not configured. Missing submissions are not zero. Confirmed no-sales activity requires an explicit approved zero-sales record.

## Initial-release boundaries

The working application supports the complete entry/review/evidence/correction path. Production operations still need agreed retention and disposal rules, independent backup schedules and restore exercises, upload malware scanning/quarantine, monitoring, and the team's real access assignments. These are not silently simulated.

Not yet implemented: OCR/full-document text indexing, AI questions, large historical import jobs, offline draft synchronization, invoice-line allocations, partial settlement allocation/outstanding balance accounting, intercompany elimination, scheduled exports, server-held issued-report snapshots, effective-dated company reorganizations, external identity providers, or a PostgreSQL migration. Group totals are combined company management figures, not statutory consolidation.
