# I-RECORDS

ITEMBA GROUP's records, evidence, and history in one simple workspace.

## Working application

- **Overview:** company totals and recent records, with honest empty states.
- **Records:** manual sales, purchases, expenses, invoice copies, payments, and collections.
- **Archive:** protected original PDF/image uploads, searchable metadata, links, and download.
- **Reviews:** submit, return, approve, withdraw, and correct with preserved history.
- **Historical explorer:** company/type/status/date/search filters and audited CSV exports.
- **Setup:** divisions, branches, business profiles, scoped roles, reporting expectations, and period controls.

Only Mwanjalisi Oil, Itemba Enterprises, and Westsides are prepopulated. Divisions and branches are created during setup. Every company supports company-wide recording immediately.

This is a records platform, not a POS, invoice-issuing tool, payment processor, or complete accounting system. See [architecture and current boundaries](docs/ARCHITECTURE.md).

## Run locally

Requires Node.js 24+ (Node's built-in SQLite is used by the tests) and npm.

```sh
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

Open the local URL printed by the server, normally `http://localhost:5173`. Use **Sign in to your workspace**. The local-only simulated identity initializes the three companies and is visibly labelled as a development account. Hosted sign-in uses the platform identity instead.

```sh
npm run typecheck
npm test
npm run build
```

For Windows environments with a broken npm command shim, the app itself can still be built with `node scripts/run-framework.mjs build`, run with `node scripts/run-framework.mjs dev`, and tested with `node scripts/test-records.mjs` after dependencies are installed.

`npm run db:migrate:local` applies only pending migrations to local D1 and tracks them in `irecords_migrations`. It never touches a remote database. New schema work uses `npm run db:generate`; inspect and commit every generated SQL file and migration metadata together.

## Deployment

The initial private deployment is blocked by a hosted migration error; no live deployment is verified. See [deployment status and recovery](docs/DEPLOYMENT-STATUS.md).

The application builds a Cloudflare-compatible Worker with logical `DB` (D1) and `BUCKET` (R2) bindings declared in `.openai/hosting.json`. The Sites platform owns deployment resources, identity, and owner-private access. The GitHub repository remains the application's source repository.

The first authenticated visitor initializes the workspace; keep the deployment owner-private until that initialization is complete. App roles and the hosting platform's audience settings are separate. Adding an access assignment does not send an invitation or change private site sharing.

The development database, document bytes, caches, and local identity are excluded from Git and deployment artifacts. No API keys or external integrations are required for this release.

## Structure

```text
app/                   Application entry, shared theme, authenticated API
components/records/    Workspace, setup, records, reviews, and archive UI
lib/records-domain.ts  Validation, money, dates, and permissions
lib/records-service.ts Persistent business workflows and reporting
db/                    Schema and database adapter
drizzle/               Versioned schema migrations and integrity triggers
scripts/               Build, local migrations, and integration tests
docs/                  Architecture, limitations, and operational recovery
```

Read [operations and recovery](docs/OPERATIONS.md) before a wider rollout with real financial records. The app is ready for setup and controlled evaluation; production backup operations, scanning, retention policies, and organizational sign-off require deployment-specific work.
