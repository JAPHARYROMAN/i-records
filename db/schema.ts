import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const organization = sqliteTable("organization", {
  id: text().primaryKey(),
  name: text().notNull(),
  created_at: text().notNull(),
  owner_id: text().notNull(),
});
export const companies = sqliteTable("companies", {
  id: text().primaryKey(),
  name: text().notNull(),
  code: text().notNull().unique(),
  description: text().notNull(),
  closed_through: text(),
  created_at: text().notNull(),
});
export const divisions = sqliteTable(
  "divisions",
  {
    id: text().primaryKey(),
    company_id: text()
      .notNull()
      .references(() => companies.id),
    name: text().notNull(),
    code: text().notNull(),
    profile: text().notNull(),
    active: integer().notNull().default(1),
    created_at: text().notNull(),
  },
  (t) => [uniqueIndex("division_company_code").on(t.company_id, t.code)],
);
export const branches = sqliteTable(
  "branches",
  {
    id: text().primaryKey(),
    company_id: text()
      .notNull()
      .references(() => companies.id),
    division_id: text()
      .notNull()
      .references(() => divisions.id),
    name: text().notNull(),
    code: text().notNull(),
    location: text().notNull().default(""),
    active: integer().notNull().default(1),
    created_at: text().notNull(),
  },
  (t) => [
    uniqueIndex("branch_division_code").on(t.division_id, t.code),
    index("branch_company").on(t.company_id),
  ],
);
export const memberships = sqliteTable(
  "memberships",
  {
    id: text().primaryKey(),
    user_id: text(),
    email: text().notNull(),
    name: text().notNull(),
    role: text().notNull(),
    company_id: text().references(() => companies.id),
    division_id: text().references(() => divisions.id),
    branch_id: text().references(() => branches.id),
    active: integer().notNull().default(1),
    created_at: text().notNull(),
  },
  (t) => [
    index("membership_email").on(t.email),
    index("membership_user").on(t.user_id),
    check(
      "membership_role",
      sql`${t.role} IN ('admin','recorder','reviewer','viewer')`,
    ),
  ],
);
export const records = sqliteTable(
  "records",
  {
    id: text().primaryKey(),
    number: text().notNull().unique(),
    company_id: text()
      .notNull()
      .references(() => companies.id),
    division_id: text().references(() => divisions.id),
    branch_id: text().references(() => branches.id),
    kind: text().notNull(),
    title: text().notNull(),
    business_date: text().notNull(),
    end_date: text(),
    amount_minor: integer().notNull(),
    currency: text().notNull().default("TZS"),
    category: text().notNull(),
    purpose: text().notNull(),
    counterparty: text().notNull().default(""),
    source_reference: text().notNull().default(""),
    related_id: text(),
    counterparty_company_id: text().references(() => companies.id),
    details: text().notNull().default("{}"),
    scope_snapshot: text().notNull(),
    no_activity: integer().notNull().default(0),
    status: text().notNull().default("draft"),
    version: integer().notNull().default(1),
    created_by: text().notNull(),
    created_name: text().notNull(),
    created_at: text().notNull(),
    updated_at: text().notNull(),
    submitted_at: text(),
    approved_at: text(),
    approved_by: text(),
    supersedes_id: text(),
    correction_reason: text(),
    evidence_exception: text(),
    mutation_id: text().notNull(),
  },
  (t) => [
    index("record_company_date").on(t.company_id, t.business_date),
    index("record_status").on(t.status),
    uniqueIndex("one_live_correction")
      .on(t.supersedes_id)
      .where(sql`${t.status} != 'voided'`),
    check(
      "record_amount",
      sql`${t.amount_minor} >= 0 AND ${t.amount_minor} <= 900000000000000`,
    ),
    check(
      "record_kind",
      sql`${t.kind} IN ('sale','purchase','expense','invoice','payment','collection')`,
    ),
    check(
      "record_status_values",
      sql`${t.status} IN ('draft','submitted','returned','approved','superseded','voided')`,
    ),
    check(
      "record_currency",
      sql`${t.currency} IN ('TZS','USD','KES','EUR','GBP')`,
    ),
    check(
      "record_scope",
      sql`${t.branch_id} IS NULL OR ${t.division_id} IS NOT NULL`,
    ),
  ],
);
export const documents = sqliteTable(
  "documents",
  {
    id: text().primaryKey(),
    company_id: text().references(() => companies.id),
    division_id: text(),
    branch_id: text(),
    name: text().notNull(),
    document_type: text().notNull(),
    document_date: text().notNull(),
    reference: text().notNull().default(""),
    description: text().notNull().default(""),
    physical_location: text().notNull().default(""),
    object_key: text().notNull().unique(),
    mime_type: text().notNull(),
    size: integer().notNull(),
    sha256: text().notNull(),
    uploaded_by: text().notNull(),
    uploaded_name: text().notNull(),
    created_at: text().notNull(),
  },
  (t) => [index("document_company_date").on(t.company_id, t.document_date)],
);
export const recordDocuments = sqliteTable(
  "record_documents",
  {
    id: text().primaryKey(),
    record_id: text()
      .notNull()
      .references(() => records.id),
    document_id: text()
      .notNull()
      .references(() => documents.id),
    created_at: text().notNull(),
  },
  (t) => [uniqueIndex("record_document_unique").on(t.record_id, t.document_id)],
);
export const audit = sqliteTable(
  "audit_events",
  {
    id: text().primaryKey(),
    company_id: text(),
    division_id: text(),
    branch_id: text(),
    record_id: text(),
    action: text().notNull(),
    actor_id: text().notNull(),
    actor_name: text().notNull(),
    reason: text().notNull().default(""),
    snapshot: text(),
    created_at: text().notNull(),
  },
  (t) => [
    index("audit_record_time").on(t.record_id, t.created_at),
    index("audit_company_time").on(t.company_id, t.created_at),
  ],
);
export const expectations = sqliteTable(
  "expectations",
  {
    id: text().primaryKey(),
    company_id: text()
      .notNull()
      .references(() => companies.id),
    division_id: text(),
    branch_id: text(),
    kind: text().notNull(),
    frequency: text().notNull(),
    start_date: text().notNull(),
    end_date: text(),
    active: integer().notNull().default(1),
  },
  (t) => [index("expectation_company").on(t.company_id)],
);
