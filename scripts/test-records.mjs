import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const output = path.resolve(".sites-runtime/domain-tests");
mkdirSync(output, { recursive: true });
for (const name of ["records-domain", "records-service"]) {
  const source = readFileSync(`lib/${name}.ts`, "utf8");
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replaceAll('"./records-domain"', '"./records-domain.mjs"');
  writeFileSync(path.join(output, `${name}.mjs`), compiled);
}
const { RecordsService } = await import(
  pathToFileURL(path.join(output, "records-service.mjs"))
);
const { moneyToMinor, validateRecord, permitted, dateValue, csvCell } =
  await import(pathToFileURL(path.join(output, "records-domain.mjs")));
class D1Adapter {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      this.sqlite.exec(readFileSync(`drizzle/${file}`, "utf8"));
  }
  prepare(sql) {
    const db = this.sqlite;
    return {
      sql,
      args: [],
      bind(...args) {
        this.args = args;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...this.args) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...this.args) };
      },
      async run() {
        const result = db.prepare(sql).run(...this.args);
        return { meta: { changes: Number(result.changes) }, success: true };
      },
    };
  }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = [];
      for (const s of statements) result.push(await s.run());
      this.sqlite.exec("COMMIT");
      return result;
    } catch (e) {
      this.sqlite.exec("ROLLBACK");
      throw e;
    }
  }
}
const actor = {
    userId: "owner",
    displayName: "Test administrator",
    email: "owner@example.test",
  },
  reviewer = {
    userId: "reviewer",
    displayName: "Test reviewer",
    email: "reviewer@example.test",
  };
async function fixture() {
  const db = new D1Adapter(),
    owner = new RecordsService(db, actor);
  await owner.initialize();
  await owner.setup({
    entity: "member",
    email: reviewer.email,
    name: reviewer.displayName,
    role: "reviewer",
    company_id: "itemba",
  });
  const review = new RecordsService(db, reviewer);
  await review.loadAccess();
  return { db, owner, review };
}
const input = (overrides = {}) => ({
  id: crypto.randomUUID(),
  company_id: "itemba",
  kind: "expense",
  title: "Test tyre replacement",
  business_date: "2026-08-10",
  amount: "850000.25",
  currency: "TZS",
  category: "Maintenance",
  purpose: "Replace damaged rear tyres before the next trip.",
  ...overrides,
});
async function create(s, values = input()) {
  const { id } = await s.saveRecord(values);
  return s.getRecord(id);
}
async function submit(s, r) {
  await s.transition(r.id, { action: "submit", version: r.version });
  return s.getRecord(r.id);
}
async function approve(s, r) {
  await s.transition(r.id, {
    action: "approve",
    version: r.version,
    reason: "Legacy evidence exception reviewed.",
  });
  return s.getRecord(r.id);
}
const tests = [];
function test(name, run) {
  tests.push({ name, run });
}
test("workspace seeds exactly three companies without divisions, branches, or transactions", async () => {
  const { owner } = await fixture(),
    w = await owner.workspace();
  assert.equal(w.companies.length, 3);
  assert.equal(w.divisions.length, 0);
  assert.equal(w.branches.length, 0);
  assert.equal((await owner.listRecords(new URLSearchParams())).total, 0);
});
test("money, dates, no-activity, and spreadsheet formula escaping", async () => {
  assert.equal(moneyToMinor("0.01"), 1);
  assert.equal(moneyToMinor("12.3"), 1230);
  for (const value of ["-1", "1e3", "1.001", "NaN", "9000000000000.01"])
    assert.throws(() => moneyToMinor(value));
  assert.throws(() => dateValue("2026-02-29"));
  assert.equal(dateValue("2024-02-29"), "2024-02-29");
  assert.throws(() => validateRecord(input({ amount: "0" })));
  assert.throws(() =>
    validateRecord(input({ amount: "0", no_activity: true })),
  );
  assert.equal(
    validateRecord(input({ kind: "sale", amount: "0", no_activity: true }))
      .no_activity,
    1,
  );
  assert.match(csvCell("=HYPERLINK('x')"), /^"'/);
});
test("idempotent creation and stale draft saves preserve one record", async () => {
  const { owner } = await fixture(),
    value = input();
  const first = await owner.saveRecord(value);
  await owner.saveRecord(value);
  assert.equal((await owner.listRecords(new URLSearchParams())).total, 1);
  await owner.saveRecord({ ...value, version: 1, amount: "950000" });
  await assert.rejects(
    () => owner.saveRecord({ ...value, version: 1, amount: "100" }),
    /changed/,
  );
  assert.equal((await owner.getRecord(first.id)).amount_minor, 95000000);
});
test("review workflow locks submissions, records return reasons, and prevents self-approval", async () => {
  const { owner, review } = await fixture();
  let r = await create(owner);
  r = await submit(owner, r);
  await assert.rejects(
    () => owner.saveRecord(input({ id: r.id, version: r.version })),
    /locked/,
  );
  await assert.rejects(
    () => review.transition(r.id, { action: "return", version: r.version }),
    /Explain/,
  );
  await review.transition(r.id, {
    action: "return",
    version: r.version,
    reason: "Specify the benefiting vehicle.",
  });
  r = await owner.getRecord(r.id);
  assert.equal(r.status, "returned");
  r = await submit(owner, r);
  await owner.setup({
    entity: "member",
    email: actor.email,
    name: actor.displayName,
    role: "reviewer",
    company_id: "itemba",
  });
  await owner.loadAccess();
  await assert.rejects(
    () =>
      owner.transition(r.id, {
        action: "approve",
        version: r.version,
        reason: "test",
      }),
    /own record/,
  );
  r = await approve(review, r);
  assert.equal(r.status, "approved");
  assert.ok(r.approved_at);
  assert.ok(
    (await owner.detail(r.id)).history.some(
      (e) => e.reason === "Specify the benefiting vehicle.",
    ),
  );
});
test("correction replaces a total once and preserves the original", async () => {
  const { owner, review } = await fixture();
  let original = await approve(
    review,
    await submit(owner, await create(owner)),
  );
  const correction = await owner.transition(original.id, {
    action: "correct",
    version: original.version,
    reason: "Correct supplier amount.",
  });
  let r = await owner.getRecord(correction.id);
  await owner.saveRecord(
    input({ id: r.id, version: r.version, amount: "900000" }),
  );
  let list = await owner.listRecords(new URLSearchParams({ kind: "expense" }));
  assert.equal(Number(list.summary[0].amount_minor), 85000025);
  r = await owner.getRecord(r.id);
  r = await approve(review, await submit(owner, r));
  assert.equal((await owner.getRecord(original.id)).status, "superseded");
  list = await owner.listRecords(new URLSearchParams({ kind: "expense" }));
  assert.equal(Number(list.summary[0].amount_minor), 90000000);
  assert.equal(list.total, 1);
  assert.equal(
    (await owner.listRecords(new URLSearchParams({ status: "superseded" })))
      .total,
    1,
  );
});
test("company and branch access apply to direct record and document reads and exports", async () => {
  const { owner, db } = await fixture();
  await owner.setup({
    entity: "division",
    company_id: "itemba",
    name: "Test logistics",
    code: "TEST",
    profile: "logistics",
  });
  const division = (await owner.workspace()).divisions[0];
  await owner.setup({
    entity: "branch",
    company_id: "itemba",
    division_id: division.id,
    name: "Test branch",
    code: "TEST",
  });
  const branch = (await owner.workspace()).branches[0];
  await assert.rejects(
    () =>
      owner.saveRecord(
        input({ company_id: "westsides", division_id: division.id }),
      ),
    /belonging/,
  );
  const r = await create(owner);
  await owner.setup({
    entity: "member",
    email: "viewer@example.test",
    name: "Test viewer",
    role: "viewer",
    company_id: "westsides",
  });
  const viewer = new RecordsService(db, {
    userId: "viewer",
    displayName: "Test viewer",
    email: "viewer@example.test",
  });
  await viewer.loadAccess();
  await assert.rejects(() => viewer.getRecord(r.id), /permission/);
  assert.equal((await viewer.listRecords(new URLSearchParams())).total, 0);
  assert.ok(
    !(await viewer.exportRecords(new URLSearchParams())).includes(r.title),
  );
  const branchMembership = {
    id: "b",
    email: "x",
    name: "x",
    role: "recorder",
    active: 1,
    user_id: "b",
    company_id: "itemba",
    division_id: division.id,
    branch_id: branch.id,
  };
  assert.equal(permitted([branchMembership], r), false);
  assert.equal(
    permitted(
      [branchMembership],
      { ...r, division_id: division.id, branch_id: branch.id },
      "record",
    ),
    true,
  );
  assert.equal(
    permitted(
      [{ ...branchMembership, role: "admin" }],
      { ...r, division_id: division.id, branch_id: branch.id },
      "review",
    ),
    false,
  );
  await db
    .prepare(
      "INSERT INTO documents(id,company_id,name,document_type,document_date,object_key,mime_type,size,sha256,uploaded_by,uploaded_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      "test-document",
      "itemba",
      "source.pdf",
      "Invoice",
      "2026-08-10",
      "private-key",
      "application/pdf",
      100,
      "hash",
      actor.userId,
      actor.displayName,
      new Date().toISOString(),
    )
    .run();
  await assert.rejects(() => viewer.getDocument("test-document"), /permission/);
});
test("closed periods protect both original and replacement dates", async () => {
  const { owner, review } = await fixture();
  const r = await approve(review, await submit(owner, await create(owner)));
  const correction = await owner.transition(r.id, {
    action: "correct",
    version: r.version,
    reason: "Move to September",
  });
  await owner.setup({
    entity: "period",
    company_id: "itemba",
    closed_through: "2026-08-31",
    reason: "August reviewed",
  });
  await assert.rejects(
    () =>
      owner.transition(r.id, {
        action: "correct",
        version: r.version,
        reason: "test",
      }),
    /closed/,
  );
  await assert.rejects(
    () =>
      owner.saveRecord(
        input({ id: correction.id, version: 1, business_date: "2026-09-01" }),
      ),
    /closed/,
  );
});
test("invoices and collections do not increase sales and currencies remain separate", async () => {
  const { owner, review } = await fixture();
  const sale = await approve(
    review,
    await submit(
      owner,
      await create(owner, input({ kind: "sale", amount: "1000" })),
    ),
  );
  await approve(
    review,
    await submit(
      owner,
      await create(
        owner,
        input({
          kind: "invoice",
          amount: "1000",
          related_id: sale.id,
          source_reference: "INV-1",
        }),
      ),
    ),
  );
  await approve(
    review,
    await submit(
      owner,
      await create(
        owner,
        input({ kind: "collection", amount: "1000", related_id: sale.id }),
      ),
    ),
  );
  await approve(
    review,
    await submit(
      owner,
      await create(
        owner,
        input({
          kind: "sale",
          amount: "10",
          currency: "USD",
          business_date: "2026-08-11",
        }),
      ),
    ),
  );
  const list = await owner.listRecords(new URLSearchParams());
  assert.equal(list.summary.filter((s) => s.kind === "sale").length, 2);
  assert.equal(
    Number(
      list.summary.find((s) => s.kind === "sale" && s.currency === "TZS")
        .amount_minor,
    ),
    100000,
  );
});
test("summary amounts are excluded from narrower date-range totals", async () => {
  const { owner, review } = await fixture();
  await approve(
    review,
    await submit(
      owner,
      await create(
        owner,
        input({
          kind: "sale",
          business_date: "2026-08-01",
          end_date: "2026-08-31",
          amount: "3100",
        }),
      ),
    ),
  );
  const partial = await owner.listRecords(
    new URLSearchParams({ from: "2026-08-10", to: "2026-08-10" }),
  );
  assert.equal(partial.total, 1);
  assert.equal(partial.summary.length, 0);
  const full = await owner.listRecords(
    new URLSearchParams({ from: "2026-08-01", to: "2026-08-31" }),
  );
  assert.equal(Number(full.summary[0].amount_minor), 310000);
});
test("reporting distinguishes not configured, missing, and approved no-activity", async () => {
  const { owner, review } = await fixture();
  assert.deepEqual((await owner.coverage("all")).items, []);
  await owner.setup({
    entity: "expectation",
    company_id: "itemba",
    kind: "sale",
    frequency: "daily",
    start_date: "2026-01-01",
  });
  const missing = (await owner.coverage("all")).items[0];
  assert.equal(missing.status, "Not submitted");
  await approve(
    review,
    await submit(
      owner,
      await create(
        owner,
        input({
          kind: "sale",
          business_date: missing.from,
          amount: "0",
          no_activity: true,
        }),
      ),
    ),
  );
  assert.equal(
    (await owner.coverage("all")).items[0].status,
    "Confirmed no activity",
  );
});
test("search totals agree with matching rows", async () => {
  const { owner, review } = await fixture();
  await approve(
    review,
    await submit(
      owner,
      await create(owner, input({ title: "Vehicle tyres", amount: "100" })),
    ),
  );
  await approve(
    review,
    await submit(
      owner,
      await create(
        owner,
        input({
          title: "Electricity",
          amount: "200",
          purpose: "Office power.",
        }),
      ),
    ),
  );
  const result = await owner.listRecords(
    new URLSearchParams({ q: "Electricity" }),
  );
  assert.equal(result.total, 1);
  assert.equal(Number(result.summary[0].amount_minor), 20000);
});
test("branch administrators cannot create sibling branches but can manage their own", async () => {
  const { owner, db } = await fixture();
  await owner.setup({
    entity: "division",
    company_id: "itemba",
    name: "Test division",
    code: "DIV",
    profile: "logistics",
  });
  const d = (await owner.workspace()).divisions[0];
  await owner.setup({
    entity: "branch",
    company_id: "itemba",
    division_id: d.id,
    name: "Test branch",
    code: "BR",
  });
  const b = (await owner.workspace()).branches[0];
  await owner.setup({
    entity: "member",
    company_id: "itemba",
    division_id: d.id,
    branch_id: b.id,
    email: "branch@example.test",
    name: "Branch administrator",
    role: "admin",
  });
  const scoped = new RecordsService(db, {
    userId: "branch",
    email: "branch@example.test",
    displayName: "Branch administrator",
  });
  await scoped.loadAccess();
  await assert.rejects(
    () =>
      scoped.setup({
        entity: "branch",
        company_id: "itemba",
        division_id: d.id,
        branch_id: b.id,
        name: "Sibling",
        code: "BAD",
      }),
    /permission/,
  );
  await scoped.setup({
    entity: "status",
    target: "branch",
    id: b.id,
    company_id: "itemba",
    active: false,
  });
  assert.equal((await owner.workspace()).branches[0].active, 0);
});
test("database preserves approved facts, audit events, and non-overlapping sales", async () => {
  const { owner, review, db } = await fixture();
  const r = await approve(
    review,
    await submit(
      owner,
      await create(owner, input({ kind: "sale", amount: "100" })),
    ),
  );
  assert.throws(
    () =>
      db.sqlite
        .prepare("UPDATE records SET amount_minor=1 WHERE id=?")
        .run(r.id),
    /immutable/,
  );
  assert.throws(
    () => db.sqlite.prepare("DELETE FROM records WHERE id=?").run(r.id),
    /preserved/,
  );
  assert.throws(
    () =>
      db.sqlite.prepare("DELETE FROM audit_events WHERE record_id=?").run(r.id),
    /immutable/,
  );
  const overlap = await submit(
    owner,
    await create(owner, input({ kind: "sale", amount: "200" })),
  );
  await assert.rejects(
    () => approve(review, overlap),
    /overlapping_sales_period/,
  );
  assert.equal((await owner.getRecord(overlap.id)).status, "submitted");
});
test("a concurrent original void prevents correction approval atomically", async () => {
  const { owner, review, db } = await fixture();
  const original = await approve(
    review,
    await submit(owner, await create(owner)),
  );
  const correction = await owner.transition(original.id, {
    action: "correct",
    version: original.version,
    reason: "Correct total",
  });
  const draft = await owner.getRecord(correction.id);
  const pending = await submit(owner, draft);
  const batch = db.batch.bind(db);
  let injected = false;
  db.batch = async (statements) => {
    if (
      !injected &&
      statements[0].sql.startsWith("UPDATE records SET status=") &&
      statements[0].args[0] === "approved"
    ) {
      injected = true;
      db.sqlite
        .prepare(
          "UPDATE records SET status='voided',version=version+1 WHERE id=?",
        )
        .run(original.id);
    }
    return batch(statements);
  };
  await assert.rejects(() => approve(review, pending), /changed/);
  assert.equal((await owner.getRecord(pending.id)).status, "submitted");
  assert.equal((await owner.getRecord(original.id)).status, "voided");
});
test("evidence cannot cross scope and locks draft ownership", async () => {
  const { owner, db } = await fixture();
  const r = await create(owner);
  await db
    .prepare(
      "INSERT INTO documents(id,company_id,name,document_type,document_date,object_key,mime_type,size,sha256,uploaded_by,uploaded_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      "test-evidence",
      "itemba",
      "source.pdf",
      "Invoice",
      "2026-08-10",
      "test-file",
      "application/pdf",
      100,
      "hash",
      actor.userId,
      actor.displayName,
      new Date().toISOString(),
    )
    .run();
  await owner.linkDocument(r.id, "test-evidence");
  await assert.rejects(
    () =>
      owner.saveRecord(
        input({ id: r.id, version: r.version, company_id: "westsides" }),
      ),
    /owning unit/,
  );
  const west = await create(owner, input({ company_id: "westsides" }));
  await assert.rejects(
    () => owner.linkDocument(west.id, "test-evidence"),
    /same company/,
  );
});
let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n${e.stack}`);
  }
}
console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
if (failures) process.exit(1);
