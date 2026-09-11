# Deployment status

The first application build is committed to GitHub and passes its automated checks. It runs locally with a separate persistent development database and document store. The hosted application is **not yet live**.

## Attempt on 11 September 2026

- Source commit: `c1c6e4c354213b4987ec19b0ca8db5bb8679d34f`
- GitHub checks: https://github.com/JAPHARYROMAN/i-records/actions/runs/34632728083
- Sites project: `appgprj_6aa43f3231748191be768d5bb03a54db`
- Saved version: `appgprj_6aa43f3231748191be768d5bb03a54db~appgver_7e53e4eb99448191b01835aeb751b5c0`
- Deployment: `appgdep_6aa446dc1a9881919f2a9a3f95bc59fd`
- Terminal status: `failed`, reported at `2026-09-11T18:22:30.200312+00:00`
- Host error: `incomplete input: SQLITE_ERROR`
- Verified live URL: none.

The native database overview returned no available bindings or tables. Production logs were unavailable. These responses do not establish which migrations were applied before failure.

All three migrations pass locally, including the database integrity triggers. A difference in hosted SQL statement parsing is a possible cause, but the host has not identified the failed file or statement. No migration has been rewritten or removed and the failed archive has not been retried.

On resuming recovery, the native database overview still exposed no bindings or tables and the Site still had no live URL. The signed-in Library search and account settings did not expose this unpublished Site's database viewer or migration ledger. The deployment service must provide the exact failed statement and applied ledger before a migration repair can be established safely. The application now also preserves original uploads when a database write succeeds but its response is lost; nineteen integration tests cover that recovery and the existing record workflows.

## Recovery

1. Obtain the failed migration/statement and the applied migration ledger from the Sites deployment service or its database viewer. Preserve existing applied files and metadata.
2. Correct only an identified, unapplied migration if the evidence establishes a source issue; otherwise resolve the hosting service issue. Preserve the database integrity protections.
3. Re-run relevant checks, build and push the exact source, save a matching version, and publish it to the existing owner-private Site. Do not create a replacement Site to bypass the unresolved state.
4. Require a successful native deployment response before presenting a live URL. Initialize as the owner and configure actual users and organizational details during setup.

Use the local run instructions in [README](../README.md) while deployment recovery is pending. Read [operations and recovery](OPERATIONS.md) before wider use with real records.
