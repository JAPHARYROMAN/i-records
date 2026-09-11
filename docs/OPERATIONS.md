# Operation and recovery

## Before team use

1. Initialize the owner-private workspace as the owner before changing its external audience.
2. Add actual divisions and branches only during setup. Choose a business profile independently of the division name.
3. Assign real users by their sign-in email and scope. Assign an independent reviewer; administration alone cannot approve.
4. Configure expected reporting only from an agreed start date. Company-wide entry works before branch setup.
5. Validate a representative period against source documents before relying on management totals.

## Local development

The development identity is explicitly labelled Local administrator and maps to the starter's loopback-only `local_seedy` account. It is not a real staff account. D1 and R2 data in `.wrangler/state` are ignored by Git and never shipped in the deployment archive. The local and hosted databases are separate.

Stop the local development process before making a filesystem-level copy of `.wrangler/state`; copying a live SQLite database without its WAL can produce an inconsistent backup. Copy the whole local state, including both D1 and R2. Keep the matching commit and migration journal. For recovery, restore into an isolated checkout, start the same revision, and verify record counts, effective totals, document hashes, and access boundaries before replacing a working copy.

## Hosted recovery requirements

Configure independent database exports and document-object backups with restricted access and agreed retention. Platform database history alone is not a document backup and audit events are not a backup. Capture schema/migration version together with the data. Store an inventory of document object keys, byte sizes, and SHA-256 hashes.

A restore exercise must demonstrate:

- approved totals and current correction chains match the source backup;
- original and superseded record versions remain retrievable;
- each sampled document downloads and hashes to its stored fingerprint;
- company/branch access still prevents unauthorized retrieval and export;
- expected submission rules and closed periods remain intact.

Do not replay an already-applied production migration or edit its SQL after deployment. Add a new migration. Failed deployment does not imply migrations were rolled back; inspect their applied boundary first.

## Upload operations

Uploads retain original bytes if the database response is lost. The server checks whether the document and its record link committed before reporting success. If it cannot confirm the result, the user is asked to check the archive before retrying. This can leave an unlinked object when metadata did not commit; it cannot delete successfully linked evidence. Investigate logged document IDs against database metadata and object keys before any manual cleanup. An unavailable or negative database read alone is not proof that bytes are safe to delete.

File signature validation is implemented; malware scanning is not. Before general staff uploads, connect a scanning/quarantine service and only release successfully scanned files. Define retention and authorized disposal by record class before importing real archives. There is deliberately no routine delete endpoint for approved history or original files.

## Verification

`npm test` runs nineteen integration checks against isolated SQLite databases, including real migrations and integrity triggers. No fixture users, branches, or transactions are added to the working database. Tests cover money precision, dates, zero activity, hierarchy/access, idempotency, review, corrections and races, closed periods, duplicate sales, invoice separation, filtered totals, and evidence scope. Upload tests use the production document service and an in-memory object store: they simulate a committed transaction with a lost response, follow the record through approval and history, verify downloaded original bytes and SHA-256, and verify that uncertain outcomes never trigger deletion. These fault-injection tests do not replace checks against hosted D1 and R2 after deployment succeeds.

Browser verification for the initial build covered local sign-in, record entry/save/submit, actual image upload and retrieval, original-byte hash equality, navigation, mobile setup, and the read-only WebMCP record search. Browser-only verification data was removed from the development database before installing the final integrity triggers.
