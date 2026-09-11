import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

// This helper never connects to a remote database.
mkdirSync(".sites-runtime", { recursive: true });
const config = {
  name: "i-records-local",
  compatibility_date: "2026-05-15",
  d1_databases: [
    {
      binding: "DB",
      database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: path.resolve("drizzle"),
      migrations_table: "irecords_migrations",
    },
  ],
};
writeFileSync(".sites-runtime/local-db.json", JSON.stringify(config, null, 2));
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    ".sites-runtime/local-db.json",
    "--persist-to",
    ".wrangler/state",
  ],
  { stdio: "inherit", env: { ...process.env, CI: "true" } },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
