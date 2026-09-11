import {
  AppError,
  COMPANY_SEEDS,
  PROFILES,
  businessToday,
  csvCell,
  dateValue,
  matchesScope,
  permitted,
  requireValue,
  textValue,
  validateRecord,
} from "./records-domain";
import type { Identity, Membership, Scope } from "./records-domain";
import type { BusinessRecord, Evidence } from "./records-types";

type Row = Record<string, unknown>;
export class RecordsService {
  db: D1Database;
  user: Identity;
  memberships: Membership[] = [];
  constructor(db: D1Database, user: Identity) {
    this.db = db;
    this.user = user;
  }
  stmt(sql: string, args: unknown[] = []) {
    return this.db.prepare(sql).bind(...args);
  }
  async rows<T = Row>(sql: string, args: unknown[] = []) {
    return (await this.stmt(sql, args).all<T>()).results;
  }
  async one<T = Row>(sql: string, args: unknown[] = []) {
    return this.stmt(sql, args).first<T>();
  }
  async loadAccess() {
    await this.stmt(
      "UPDATE memberships SET user_id=? WHERE email=? AND user_id IS NULL AND active=1",
      [this.user.userId, this.user.email.toLowerCase()],
    ).run();
    this.memberships = await this.rows<Membership>(
      "SELECT * FROM memberships WHERE user_id=? AND active=1",
      [this.user.userId],
    );
  }
  can(scope: Scope, action = "view") {
    return permitted(this.memberships, scope, action);
  }
  access(scope: Scope, action = "view") {
    requireValue(
      this.can(scope, action),
      "You do not have permission for this action in this part of the organization.",
      403,
    );
  }
  scopeSQL(alias = "", action = "view"): { sql: string; args: unknown[] } {
    const prefix = alias ? `${alias}.` : "",
      args: unknown[] = [];
    const clauses = this.memberships
      .filter((m) => permitted([m], m, action))
      .map((m) => {
        const parts: string[] = [];
        for (const field of [
          "company_id",
          "division_id",
          "branch_id",
        ] as const) {
          if (m[field]) {
            parts.push(`${prefix}${field}=?`);
            args.push(m[field]);
          }
        }
        return parts.length ? `(${parts.join(" AND ")})` : "1=1";
      });
    return { sql: clauses.length ? `(${clauses.join(" OR ")})` : "0=1", args };
  }
  auditStatement(
    action: string,
    scope: Scope,
    reason = "",
    record_id: string | null = null,
    snapshot: unknown = null,
  ) {
    return this.stmt(
      "INSERT INTO audit_events(id,company_id,division_id,branch_id,record_id,action,actor_id,actor_name,reason,snapshot,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [
        crypto.randomUUID(),
        scope.company_id,
        scope.division_id ?? null,
        scope.branch_id ?? null,
        record_id,
        action,
        this.user.userId,
        this.user.displayName,
        reason,
        snapshot ? JSON.stringify(snapshot) : null,
        new Date().toISOString(),
      ],
    );
  }
  async initialize() {
    requireValue(
      !(await this.one("SELECT id FROM organization LIMIT 1")),
      "The workspace is already initialized.",
      409,
    );
    const now = new Date().toISOString();
    await this.db.batch([
      this.stmt(
        "INSERT INTO organization(id,name,created_at,owner_id) VALUES('itemba-group','ITEMBA GROUP',?,?)",
        [now, this.user.userId],
      ),
      ...COMPANY_SEEDS.map((c) =>
        this.stmt(
          "INSERT INTO companies(id,name,code,description,created_at) VALUES(?,?,?,?,?)",
          [c.id, c.name, c.code, c.description, now],
        ),
      ),
      this.stmt(
        "INSERT INTO memberships(id,user_id,email,name,role,created_at) VALUES(?,?,?,?,?,?)",
        [
          crypto.randomUUID(),
          this.user.userId,
          this.user.email.toLowerCase(),
          this.user.displayName,
          "admin",
          now,
        ],
      ),
      this.auditStatement("Workspace initialized", { company_id: null }),
    ]);
    await this.loadAccess();
    return { ok: true };
  }
  async workspace() {
    const initialized = !!(await this.one(
      "SELECT id FROM organization LIMIT 1",
    ));
    if (!initialized)
      return {
        user: this.user,
        initialized: false,
        memberships: [],
        companies: [],
        divisions: [],
        branches: [],
        members: [],
        expectations: [],
        activity: [],
      };
    requireValue(
      this.memberships.length,
      "Your account has not been assigned access. Ask the group administrator to add your email.",
      403,
    );
    const companyIds = new Set(this.memberships.map((m) => m.company_id));
    const all = companyIds.has(null);
    const companies = (
      await this.rows(
        "SELECT * FROM companies ORDER BY CASE id WHEN 'mwanjalisi' THEN 1 WHEN 'itemba' THEN 2 ELSE 3 END",
      )
    ).filter((c) => all || companyIds.has(c.id as string));
    const divisions = (
      await this.rows("SELECT * FROM divisions ORDER BY name")
    ).filter((d) =>
      this.memberships.some(
        (m) =>
          (!m.company_id || m.company_id === d.company_id) &&
          (!m.division_id || m.division_id === d.id),
      ),
    );
    const branches = (
      await this.rows("SELECT * FROM branches ORDER BY name")
    ).filter((b) => this.can({ ...b, branch_id: b.id } as unknown as Scope));
    const scope = this.scopeSQL();
    const adminScope = this.scopeSQL("", "admin");
    const [activity, expectations, members] = await Promise.all([
      this.rows(
        `SELECT * FROM audit_events WHERE ${scope.sql} ORDER BY created_at DESC LIMIT 20`,
        scope.args,
      ),
      this.rows(`SELECT * FROM expectations WHERE ${scope.sql}`, scope.args),
      this.rows(
        `SELECT * FROM memberships WHERE ${adminScope.sql} ORDER BY created_at`,
        adminScope.args,
      ),
    ]);
    return {
      user: this.user,
      initialized,
      memberships: this.memberships,
      companies,
      divisions,
      branches,
      members,
      expectations,
      activity,
    };
  }
  async validateScope(scope: Scope, active = true) {
    requireValue(scope.company_id, "Choose a company.");
    const company = await this.one("SELECT * FROM companies WHERE id=?", [
      scope.company_id,
    ]);
    requireValue(company, "Company not found.");
    let division: Row | null = null,
      branch: Row | null = null;
    if (scope.division_id) {
      division = await this.one(
        "SELECT * FROM divisions WHERE id=? AND company_id=?",
        [scope.division_id, scope.company_id],
      );
      requireValue(
        division && (!active || division.active === 1),
        "Choose an active division belonging to this company.",
      );
    }
    if (scope.branch_id) {
      requireValue(division, "Choose a division first.");
      branch = await this.one(
        "SELECT * FROM branches WHERE id=? AND division_id=? AND company_id=?",
        [scope.branch_id, scope.division_id, scope.company_id],
      );
      requireValue(
        branch && (!active || branch.active === 1),
        "Choose an active branch belonging to this division.",
      );
    }
    return {
      company: company.name,
      division: division?.name ?? null,
      branch: branch?.name ?? null,
    };
  }
  async checkPeriod(scope: Scope, date: string) {
    const c = await this.one(
      "SELECT closed_through FROM companies WHERE id=?",
      [scope.company_id],
    );
    requireValue(
      !c?.closed_through || date > String(c.closed_through),
      "This reporting period is closed. A company administrator must reopen it before posting or correcting records.",
      409,
    );
  }
  async setup(input: Row) {
    const entity = textValue(input.entity, "Setup type", 30),
      scope: Scope = {
        company_id: (input.company_id as string) || null,
        division_id: (input.division_id as string) || null,
        branch_id: (input.branch_id as string) || null,
      };
    if (entity !== "status") this.access(scope, "admin");
    const now = new Date().toISOString(),
      id = crypto.randomUUID();
    if (entity === "division" || entity === "branch") {
      await this.validateScope(scope);
      const name = textValue(input.name, "Name", 120),
        code = textValue(input.code, "Code", 30).toUpperCase();
      requireValue(
        /^[A-Z0-9_-]+$/.test(code),
        "Codes may contain letters, numbers, hyphens, and underscores.",
      );
      if (entity === "division") {
        this.access({ company_id: scope.company_id }, "admin");
        const profile = textValue(input.profile, "Business profile", 30);
        requireValue(profile in PROFILES, "Select a business profile.");
        await this.db.batch([
          this.stmt(
            "INSERT INTO divisions(id,company_id,name,code,profile,created_at) VALUES(?,?,?,?,?,?)",
            [id, scope.company_id, name, code, profile, now],
          ),
          this.auditStatement(
            "Division created",
            { ...scope, division_id: id },
            name,
          ),
        ]);
      } else {
        requireValue(scope.division_id, "Choose a division.");
        this.access(
          {
            company_id: scope.company_id,
            division_id: scope.division_id,
            branch_id: null,
          },
          "admin",
        );
        await this.db.batch([
          this.stmt(
            "INSERT INTO branches(id,company_id,division_id,name,code,location,created_at) VALUES(?,?,?,?,?,?,?)",
            [
              id,
              scope.company_id,
              scope.division_id,
              name,
              code,
              textValue(input.location, "Location", 200, false),
              now,
            ],
          ),
          this.auditStatement(
            "Branch created",
            { ...scope, branch_id: id },
            name,
          ),
        ]);
      }
    } else if (entity === "member") {
      if (scope.company_id) await this.validateScope(scope);
      else
        requireValue(
          !scope.division_id && !scope.branch_id,
          "A company is required for this scope.",
        );
      const email = textValue(input.email, "Email", 254).toLowerCase(),
        name = textValue(input.name, "Name", 120),
        role = textValue(input.role, "Role", 20);
      requireValue(
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        "Enter a valid email address.",
      );
      requireValue(
        ["admin", "recorder", "reviewer", "viewer"].includes(role),
        "Choose a valid role.",
      );
      await this.db.batch([
        this.stmt(
          "INSERT INTO memberships(id,email,name,role,company_id,division_id,branch_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
          [
            id,
            email,
            name,
            role,
            scope.company_id,
            scope.division_id,
            scope.branch_id,
            now,
          ],
        ),
        this.auditStatement("Access assigned", scope, `${name}: ${role}`),
      ]);
    } else if (entity === "expectation") {
      await this.validateScope(scope);
      const kind = textValue(input.kind, "Record type", 20),
        frequency = textValue(input.frequency, "Frequency", 20),
        start = dateValue(input.start_date, "Reporting start date");
      requireValue(
        ["sale", "purchase", "expense"].includes(kind),
        "Choose sales, purchases, or expenses.",
      );
      requireValue(
        ["daily", "weekly", "monthly"].includes(frequency),
        "Choose a reporting frequency.",
      );
      requireValue(
        !(await this.one(
          "SELECT id FROM expectations WHERE company_id=? AND division_id IS ? AND branch_id IS ? AND kind=? AND active=1",
          [scope.company_id, scope.division_id, scope.branch_id, kind],
        )),
        "This unit already has an active expectation for that record type.",
        409,
      );
      await this.db.batch([
        this.stmt(
          "INSERT INTO expectations(id,company_id,division_id,branch_id,kind,frequency,start_date) VALUES(?,?,?,?,?,?,?)",
          [
            id,
            scope.company_id,
            scope.division_id,
            scope.branch_id,
            kind,
            frequency,
            start,
          ],
        ),
        this.auditStatement(
          "Reporting configured",
          scope,
          `${kind}, ${frequency}, from ${start}`,
        ),
      ]);
    } else if (entity === "period") {
      this.access({ company_id: scope.company_id }, "admin");
      await this.validateScope(scope, false);
      const through = input.closed_through
        ? dateValue(input.closed_through, "Closed through")
        : null;
      const reason = textValue(input.reason, "Reason", 1000);
      await this.db.batch([
        this.stmt("UPDATE companies SET closed_through=? WHERE id=?", [
          through,
          scope.company_id,
        ]),
        this.auditStatement(
          through ? "Period closed" : "Period reopened",
          scope,
          reason,
        ),
      ]);
    } else if (entity === "status") {
      const tables: Record<string, string> = {
        division: "divisions",
        branch: "branches",
        member: "memberships",
        expectation: "expectations",
      };
      const table = tables[String(input.target)];
      requireValue(table, "Invalid setup item.");
      const item = await this.one(`SELECT * FROM ${table} WHERE id=?`, [
        textValue(input.id, "Item", 100),
      ]);
      requireValue(item, "Item not found.", 404);
      this.access(
        {
          ...item,
          ...(table === "divisions"
            ? { division_id: item.id }
            : table === "branches"
              ? { branch_id: item.id }
              : {}),
        } as unknown as Scope,
        "admin",
      );
      const active = input.active === true ? 1 : 0;
      if (table === "expectations")
        requireValue(
          !active,
          "Create a new expectation with its own start date to resume reporting.",
        );
      if (
        table === "memberships" &&
        item.role === "admin" &&
        !item.company_id &&
        !active
      ) {
        const count = await this.one(
          "SELECT count(*) as n FROM memberships WHERE role='admin' AND company_id IS NULL AND active=1",
        );
        requireValue(
          Number(count?.n) > 1,
          "Keep at least one group administrator active.",
        );
        requireValue(
          item.user_id !== this.user.userId,
          "Ask another group administrator to deactivate your own access.",
        );
      }
      await this.db.batch([
        this.stmt(
          `UPDATE ${table} SET active=?${table === "expectations" ? ",end_date=?" : ""} WHERE id=?`,
          [
            active,
            ...(table === "expectations" ? [businessToday()] : []),
            item.id,
          ],
        ),
        this.auditStatement(
          active ? "Setup item activated" : "Setup item deactivated",
          item as unknown as Scope,
          String(item.name ?? item.kind),
        ),
      ]);
    } else throw new AppError("Unknown setup action.");
    return { id, ok: true };
  }
  async getRecord(id: string, action = "view") {
    const record = await this.one<BusinessRecord>(
      "SELECT r.*, (SELECT count(*) FROM record_documents WHERE record_id=r.id) as document_count FROM records r WHERE r.id=?",
      [id],
    );
    requireValue(record, "Record not found.", 404);
    this.access(record, action);
    return record;
  }
  async saveRecord(input: Row) {
    const values = validateRecord(input);
    const id = textValue(input.id, "Record identifier", 100);
    requireValue(/^[a-zA-Z0-9_-]{10,100}$/.test(id), "Invalid record identifier.");
    const existing = await this.one<BusinessRecord>("SELECT * FROM records WHERE id=?", [id]);
    const scopeSnapshot = await this.validateScope(values, !existing?.supersedes_id);
    this.access(values, "record");
    await this.checkPeriod(values, values.business_date);
    if (values.related_id) {
      const related = await this.getRecord(values.related_id);
      requireValue(
        related.company_id === values.company_id,
        "Linked records must belong to the same company.",
      );
    }
    if (values.counterparty_company_id) {
      requireValue(
        values.counterparty_company_id !== values.company_id,
        "An internal counterparty must be a different company.",
      );
      requireValue(
        await this.one("SELECT id FROM companies WHERE id=?", [
          values.counterparty_company_id,
        ]),
        "Internal counterparty not found.",
      );
    }
    const now = new Date().toISOString(),
      token = crypto.randomUUID();
    if (existing) {
      this.access(existing, "record");
      requireValue(
        existing.created_by === this.user.userId,
        "Only the author can edit this draft.",
        403,
      );
      if (input.version === undefined) return { id: existing.id, reused: true };
      const evidence = await this.one(
        "SELECT count(*) as n FROM record_documents WHERE record_id=?",
        [id],
      );
      if (Number(evidence?.n) > 0)
        requireValue(
          existing.company_id === values.company_id &&
            existing.division_id === values.division_id &&
            existing.branch_id === values.branch_id,
          "Records with attached evidence must retain their owning unit.",
        );
      requireValue(
        ["draft", "returned"].includes(existing.status),
        "This record is locked. Start a correction for approved history.",
        409,
      );
      requireValue(
        Number(input.version) === existing.version,
        "This record changed. Reload it before saving.",
        409,
      );
      if (existing.supersedes_id)
        requireValue(
          existing.company_id === values.company_id &&
            existing.division_id === values.division_id &&
            existing.branch_id === values.branch_id &&
            existing.kind === values.kind,
          "A correction must preserve its owning unit and record type.",
        );
      await this.checkPeriod(existing, existing.business_date);
      const fields = Object.keys(values),
        args = Object.values(values);
      const result = await this.db.batch([
        this.stmt(
          `UPDATE records SET ${fields.map((f) => `${f}=?`).join(",")},scope_snapshot=?,updated_at=?,version=version+1,mutation_id=? WHERE id=? AND version=? AND status IN ('draft','returned')`,
          [
            ...args,
            JSON.stringify(scopeSnapshot),
            now,
            token,
            id,
            existing.version,
          ],
        ),
        this.recordAudit(id, token, "Draft updated", ""),
      ]);
      requireValue(
        result[0].meta.changes,
        "This record changed. Reload and try again.",
        409,
      );
    } else {
      const fields = [
        "id",
        "number",
        ...Object.keys(values),
        "scope_snapshot",
        "created_by",
        "created_name",
        "created_at",
        "updated_at",
        "mutation_id",
      ];
      const args = [
        id,
        `IR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        ...Object.values(values),
        JSON.stringify(scopeSnapshot),
        this.user.userId,
        this.user.displayName,
        now,
        now,
        token,
      ];
      await this.db.batch([
        this.stmt(
          `INSERT INTO records(${fields.join(",")}) VALUES(${fields.map(() => "?").join(",")}) ON CONFLICT(id) DO NOTHING`,
          args,
        ),
        this.recordAudit(id, token, "Draft created", ""),
      ]);
      const saved = await this.getRecord(id);
      requireValue(
        saved.created_by === this.user.userId,
        "Record identifier already exists.",
        409,
      );
    }
    return { id };
  }
  recordAudit(id: string, token: string, action: string, reason: string) {
    return this.stmt(
      "INSERT INTO audit_events(id,company_id,division_id,branch_id,record_id,action,actor_id,actor_name,reason,snapshot,created_at) SELECT ?,company_id,division_id,branch_id,id,?,?,?,?,json_object('number',number,'kind',kind,'title',title,'amount_minor',amount_minor,'currency',currency,'business_date',business_date,'end_date',end_date,'purpose',purpose,'category',category,'counterparty',counterparty,'source_reference',source_reference,'status',status,'version',version,'scope',scope_snapshot,'details',details,'no_activity',no_activity,'approved_at',approved_at,'supersedes_id',supersedes_id),? FROM records WHERE id=? AND mutation_id=?",
      [
        crypto.randomUUID(),
        action,
        this.user.userId,
        this.user.displayName,
        reason,
        new Date().toISOString(),
        id,
        token,
      ],
    );
  }
  async transition(id: string, input: Row) {
    const r = await this.getRecord(id),
      action = textValue(input.action, "Action", 30),
      now = new Date().toISOString(),
      token = crypto.randomUUID();
    requireValue(
      Number(input.version) === r.version,
      "This record changed. Reload it before continuing.",
      409,
    );
    let originalVersion: number | undefined;
    let target = "",
      reason = textValue(input.reason, "Reason", 1500, false),
      extra = "",
      extraArgs: unknown[] = [];
    if (action === "correct") {
      this.access(r, "record");
      requireValue(
        r.status === "approved",
        "Only approved records can be corrected.",
      );
      await this.checkPeriod(r, r.business_date);
      requireValue(reason, "Explain why this record needs a correction.");
      const correctionId = crypto.randomUUID();
      const fields = [
        "company_id",
        "division_id",
        "branch_id",
        "kind",
        "title",
        "business_date",
        "end_date",
        "amount_minor",
        "currency",
        "category",
        "purpose",
        "counterparty",
        "source_reference",
        "related_id",
        "counterparty_company_id",
        "details",
        "scope_snapshot",
        "no_activity",
      ];
      await this.db.batch([
        this.stmt(
          `INSERT INTO records(id,number,${fields.join(",")},created_by,created_name,created_at,updated_at,supersedes_id,correction_reason,mutation_id) SELECT ?,?,${fields.join(",")},?,?,?,?,id,?,? FROM records WHERE id=? AND version=? AND status='approved'`,
          [
            correctionId,
            `IR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            this.user.userId,
            this.user.displayName,
            now,
            now,
            reason,
            token,
            id,
            r.version,
          ],
        ),
        this.stmt(
          "INSERT INTO record_documents(id,record_id,document_id,created_at) SELECT ?||document_id,?,document_id,? FROM record_documents WHERE record_id=? AND EXISTS(SELECT 1 FROM records WHERE id=?)",
          [`${correctionId}-`, correctionId, now, id, correctionId],
        ),
        this.recordAudit(correctionId, token, "Correction drafted", reason),
      ]);
      requireValue(
        await this.one("SELECT id FROM records WHERE id=?", [correctionId]),
        "The original changed. Reload and try again.",
        409,
      );
      return { id: correctionId };
    }
    if (["submit", "withdraw", "discard"].includes(action)) {
      this.access(r, "record");
      requireValue(
        r.created_by === this.user.userId,
        "Only the author can perform this action.",
        403,
      );
      if (action === "submit") {
        requireValue(
          ["draft", "returned"].includes(r.status),
          "Only draft or returned records can be submitted.",
        );
        await this.checkPeriod(r, r.business_date);
        await this.validateScope(r, !r.supersedes_id);
        target = "submitted";
        extra = ",submitted_at=?";
        extraArgs = [now];
      }
      if (action === "withdraw") {
        requireValue(
          r.status === "submitted",
          "Only pending submissions can be withdrawn.",
        );
        target = "draft";
      }
      if (action === "discard") {
        requireValue(
          ["draft", "returned"].includes(r.status),
          "Only drafts or returned records can be discarded.",
        );
        target = "voided";
        reason = reason || "Draft discarded by author";
      }
    } else if (["approve", "return", "void"].includes(action)) {
      this.access(r, "review");
      requireValue(
        r.created_by !== this.user.userId,
        "Your own record must be approved or returned by another reviewer.",
        403,
      );
      if (action === "void") {
        requireValue(
          r.status === "approved",
          "Only approved records can be voided.",
        );
        requireValue(reason, "A reason is required to void a record.");
        await this.checkPeriod(r, r.business_date);
        target = "voided";
      } else {
        requireValue(
          r.status === "submitted",
          "This record is no longer awaiting review.",
          409,
        );
        if (action === "return") {
          requireValue(reason, "Explain what needs to be corrected.");
          target = "returned";
        } else {
          await this.checkPeriod(r, r.business_date);
          target = "approved";
          if (!r.document_count)
            requireValue(
              reason,
              "Explain the evidence exception before approving without a document.",
            );
          extra = ",approved_at=?,approved_by=?,evidence_exception=?";
          extraArgs = [
            now,
            this.user.userId,
            !r.document_count ? reason : null,
          ];
          if (r.supersedes_id) {
            const original = await this.getRecord(r.supersedes_id, "review");
            requireValue(
              original.status === "approved",
              "The original record is no longer effective.",
              409,
            );
            await this.checkPeriod(original, original.business_date);
            originalVersion = original.version;
          }
        }
      }
    } else throw new AppError("Unknown record action.");
    const statements = [
      this.stmt(
        `UPDATE records SET status=?,version=version+1,updated_at=?,mutation_id=?${extra} WHERE id=? AND version=? AND status=?${originalVersion !== undefined ? " AND EXISTS(SELECT 1 FROM records original WHERE original.id=? AND original.status='approved' AND original.version=?)" : ""}`,
        [
          target,
          now,
          token,
          ...extraArgs,
          id,
          r.version,
          r.status,
          ...(originalVersion !== undefined
            ? [r.supersedes_id, originalVersion]
            : []),
        ],
      ),
    ];
    if (target === "approved" && r.supersedes_id) {
      statements.push(
        this.stmt(
          "UPDATE records SET status='superseded',version=version+1,updated_at=?,mutation_id=? WHERE id=? AND status='approved' AND EXISTS(SELECT 1 FROM records WHERE id=? AND mutation_id=?)",
          [now, token, r.supersedes_id, id, token],
        ),
      );
      statements.push(
        this.recordAudit(
          r.supersedes_id,
          token,
          "Superseded by correction",
          reason || r.correction_reason || "",
        ),
      );
    }
    const labels: Record<string, string> = {
      submit: "Submitted for review",
      withdraw: "Submission withdrawn",
      discard: "Draft discarded",
      approve: "Approved and posted",
      return: "Returned for correction",
      void: "Record voided",
    };
    statements.push(this.recordAudit(id, token, labels[action], reason));
    const result = await this.db.batch(statements);
    requireValue(
      result[0].meta.changes,
      "This record changed. Reload and try again.",
      409,
    );
    return { id, status: target };
  }
  async listRecords(params: URLSearchParams) {
    const scope = this.scopeSQL("r"),
      parts = [scope.sql],
      args = [...scope.args];
    for (const [key, column] of [
      ["company", "company_id"],
      ["division", "division_id"],
      ["branch", "branch_id"],
      ["kind", "kind"],
      ["currency", "currency"],
    ]) {
      const v = params.get(key);
      if (v && v !== "all") {
        parts.push(`r.${column}=?`);
        args.push(v);
      }
    }
    const from = params.get("from"),
      to = params.get("to"),
      asOf = params.get("as_of");
    if (from) {
      parts.push("COALESCE(r.end_date,r.business_date)>=?");
      args.push(dateValue(from));
    }
    if (to) {
      parts.push("r.business_date<=?");
      args.push(dateValue(to));
    }
    // Summary-only records overlapping a range are visible but not silently prorated.
    const summaryParts = [...parts, "r.status='approved'"];
    if (from) {
      summaryParts.push("r.business_date>=?");
    }
    if (to) {
      summaryParts.push("COALESCE(r.end_date,r.business_date)<=?");
    }
    const summaryArgs = [...args, ...(from ? [from] : []), ...(to ? [to] : [])];
    const status = params.get("status");
    if (status && status !== "all") {
      parts.push("r.status=?");
      args.push(status);
    } else parts.push("r.status NOT IN ('voided','superseded')");
    const search = params.get("q")?.trim();
    if (search) {
      requireValue(search.length <= 300, "Search is too long.");
      parts.push(
        "(r.title LIKE ? ESCAPE '\\' OR r.purpose LIKE ? ESCAPE '\\' OR r.source_reference LIKE ? ESCAPE '\\' OR r.counterparty LIKE ? ESCAPE '\\' OR r.number LIKE ? ESCAPE '\\')",
      );
      const query = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      args.push(query, query, query, query, query);
      summaryParts.push(parts[parts.length - 1]);
      summaryArgs.push(query, query, query, query, query);
    }
    if (asOf) {
      throw new AppError(
        "Use a saved report export to reproduce an earlier report. Live filters show the latest approved history.",
      );
    }
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 30)),
      offset = Math.max(0, Number(params.get("offset")) || 0);
    requireValue(
      Number.isInteger(offset) && offset <= 1000000,
      "Invalid page.",
    );
    const [records, count, summary, pending] = await Promise.all([
      this.rows(
        `SELECT r.*,(SELECT count(*) FROM record_documents WHERE record_id=r.id) as document_count FROM records r WHERE ${parts.join(" AND ")} ORDER BY r.business_date DESC,r.created_at DESC LIMIT ? OFFSET ?`,
        [...args, limit, offset],
      ),
      this.one(
        `SELECT count(*) AS total FROM records r WHERE ${parts.join(" AND ")}`,
        args,
      ),
      this.rows(
        `SELECT r.kind,r.currency,CAST(SUM(r.amount_minor) AS TEXT) as amount_minor,count(*) as count FROM records r WHERE ${summaryParts.join(" AND ")} GROUP BY r.kind,r.currency`,
        summaryArgs,
      ),
      this.one(
        `SELECT count(*) as n FROM records r WHERE ${scope.sql} AND r.status='submitted'${params.get("company") && params.get("company") !== "all" ? " AND company_id=?" : ""}`,
        [
          ...scope.args,
          ...(params.get("company") && params.get("company") !== "all"
            ? [params.get("company")]
            : []),
        ],
      ),
    ]);
    return {
      records,
      total: count?.total ?? 0,
      summary,
      pending: pending?.n ?? 0,
    };
  }
  async detail(id: string) {
    const record = await this.getRecord(id);
    const scope = this.scopeSQL();
    const [documents, history, related] = await Promise.all([
      this.rows(
        "SELECT d.* FROM documents d JOIN record_documents rd ON rd.document_id=d.id WHERE rd.record_id=? ORDER BY d.created_at",
        [id],
      ),
      this.rows(
        "SELECT * FROM audit_events WHERE record_id=? ORDER BY created_at DESC",
        [id],
      ),
      this.rows(
        `SELECT * FROM records WHERE ${scope.sql} AND (related_id=? OR id=? OR supersedes_id=? OR id=?) ORDER BY created_at DESC`,
        [...scope.args, id, record.related_id, id, record.supersedes_id],
      ),
    ]);
    return {
      record,
      documents: documents.filter((d) => this.can(d as unknown as Scope)),
      history,
      related,
    };
  }
  async listDocuments(params: URLSearchParams) {
    const scope = this.scopeSQL("d"),
      parts = [scope.sql],
      args = [...scope.args];
    if (params.get("company") && params.get("company") !== "all") {
      parts.push("d.company_id=?");
      args.push(params.get("company"));
    }
    if (params.get("q")) {
      parts.push(
        "(d.name LIKE ? OR d.reference LIKE ? OR d.description LIKE ?)",
      );
      const q = `%${params.get("q")}%`;
      args.push(q, q, q);
    }
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const docs = await this.rows(
      `SELECT d.*,(SELECT group_concat(record_id) FROM record_documents WHERE document_id=d.id) as record_ids FROM documents d WHERE ${parts.join(" AND ")} ORDER BY d.created_at DESC LIMIT 50 OFFSET ?`,
      [...args, offset],
    );
    const count = await this.one(
      `SELECT count(*) as n FROM documents d WHERE ${parts.join(" AND ")}`,
      args,
    );
    return { documents: docs, total: count?.n ?? 0 };
  }
  async getDocument(id: string) {
    const d = await this.one<Evidence & { object_key: string }>(
      "SELECT * FROM documents WHERE id=?",
      [id],
    );
    requireValue(d, "Document not found.", 404);
    this.access(d);
    return d;
  }
  async linkDocument(recordId: string, documentId: string) {
    const r = await this.getRecord(recordId, "record"),
      d = await this.getDocument(documentId);
    requireValue(
      d.company_id === r.company_id &&
        d.division_id === r.division_id &&
        d.branch_id === r.branch_id,
      "The document must belong to the same company, division, and branch.",
    );
    requireValue(
      !["voided", "superseded"].includes(r.status),
      "Attach evidence to the effective record.",
    );
    await this.db.batch([
      this.stmt(
        "INSERT INTO record_documents(id,record_id,document_id,created_at) VALUES(?,?,?,?) ON CONFLICT(record_id,document_id) DO NOTHING",
        [crypto.randomUUID(), recordId, documentId, new Date().toISOString()],
      ),
      this.auditStatement("Evidence linked", r, d.name, recordId, {
        document_id: documentId,
      }),
    ]);
    return { ok: true };
  }
  async exportRecords(params: URLSearchParams) {
    const filter = new URLSearchParams(params);
    filter.set("limit", "100");
    let offset = 0;
    const items: BusinessRecord[] = [];
    do {
      filter.set("offset", String(offset));
      const page = await this.listRecords(filter);
      requireValue(
        Number(page.total) <= 10000,
        "Narrow this export to 10,000 records or fewer.",
      );
      items.push(...(page.records as BusinessRecord[]));
      offset += 100;
      if (offset >= Number(page.total)) break;
    } while (offset < 10000);
    const exportedAt = new Date().toISOString();
    const head = [
      "Record",
      "Type",
      "Company / division / branch",
      "Business date",
      "Period end",
      "Amount",
      "Currency",
      "Status",
      "Purpose",
      "Counterparty",
      "Reference",
      "Version",
      "Approved at",
      "Exported at",
    ];
    const csv = [
      head.map(csvCell).join(","),
      ...items.map((r) =>
        [
          r.number,
          r.kind,
          Object.values(JSON.parse(r.scope_snapshot))
            .filter(Boolean)
            .join(" / "),
          r.business_date,
          r.end_date,
          (r.amount_minor / 100).toFixed(2),
          r.currency,
          r.status,
          r.purpose,
          r.counterparty,
          r.source_reference,
          r.version,
          r.approved_at,
          exportedAt,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n");
    await this.auditStatement(
      "Records exported",
      {
        company_id:
          params.get("company") && params.get("company") !== "all"
            ? params.get("company")
            : (this.memberships[0]?.company_id ?? null),
        division_id: this.memberships[0]?.division_id,
        branch_id: this.memberships[0]?.branch_id,
      },
      `${items.length} records; ${params.toString()}`,
    ).run();
    return csv;
  }
  async coverage(company: string | null) {
    const filter = this.scopeSQL(),
      rules = await this.rows(
        `SELECT * FROM expectations WHERE ${filter.sql} AND active=1${company && company !== "all" ? " AND company_id=?" : ""}`,
        [...filter.args, ...(company && company !== "all" ? [company] : [])],
      );
    const items = [];
    const today = businessToday(),
      fmt = (d: Date) => d.toISOString().slice(0, 10);
    for (const rule of rules) {
      const end = new Date(`${today}T12:00:00Z`),
        start = new Date(end);
      end.setUTCDate(end.getUTCDate() - 1);
      start.setTime(end.getTime());
      if (rule.frequency === "weekly") {
        const current = new Date(`${today}T12:00:00Z`);
        current.setUTCDate(
          current.getUTCDate() - ((current.getUTCDay() + 6) % 7),
        );
        end.setTime(current.getTime());
        end.setUTCDate(end.getUTCDate() - 1);
        start.setTime(end.getTime());
        start.setUTCDate(start.getUTCDate() - 6);
      }
      if (rule.frequency === "monthly") {
        const current = new Date(`${today}T12:00:00Z`);
        start.setTime(
          Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1, 12),
        );
        end.setTime(
          Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 0, 12),
        );
      }
      const from = fmt(start),
        to = fmt(end),
        scope = {
          company_id: String(rule.company_id),
          division_id: rule.division_id as string | null,
          branch_id: rule.branch_id as string | null,
        };
      const scopeNames = await this.validateScope(scope, false);
      let status = "Not yet due";
      if (from >= String(rule.start_date)) {
        const submissions = await this.rows(
          "SELECT status,no_activity FROM records WHERE company_id=? AND division_id IS ? AND branch_id IS ? AND kind=? AND business_date=? AND COALESCE(end_date,business_date)=? AND status NOT IN ('superseded','voided')",
          [
            rule.company_id,
            rule.division_id,
            rule.branch_id,
            rule.kind,
            from,
            to,
          ],
        );
        const approved = submissions.filter((r) => r.status === "approved");
        status = approved.length
          ? approved.every((r) => r.no_activity === 1)
            ? "Confirmed no activity"
            : "Approved"
          : submissions.some((r) => r.status === "submitted")
            ? "Awaiting review"
            : submissions.some((r) => r.status === "returned")
              ? "Returned"
              : submissions.some((r) => r.status === "draft")
                ? "Draft only"
                : "Not submitted";
      }
      items.push({
        id: rule.id,
        scope: Object.values(scopeNames).filter(Boolean).join(" / "),
        from,
        to,
        status,
        kind: rule.kind,
      });
    }
    return { items };
  }
}
