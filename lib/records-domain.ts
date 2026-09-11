export const RECORD_KINDS = [
  "sale",
  "purchase",
  "expense",
  "invoice",
  "payment",
  "collection",
] as const;
export const KIND_LABELS: Record<string, string> = {
  sale: "Daily sales",
  purchase: "Purchase",
  expense: "Expense",
  invoice: "Invoice",
  payment: "Payment",
  collection: "Collection",
};
export const PROFILES: Record<string, string> = {
  petroleum: "Petroleum & fuel stations",
  logistics: "Logistics",
  agriculture: "Agriculture",
  construction: "Construction",
  trading: "Wholesale & retail",
  general: "General records",
};
export const COMPANY_SEEDS = [
  {
    id: "mwanjalisi",
    name: "Mwanjalisi Oil",
    code: "MO",
    description: "Petroleum & fuel stations",
  },
  {
    id: "itemba",
    name: "Itemba Enterprises",
    code: "IE",
    description: "Logistics, agriculture & construction",
  },
  {
    id: "westsides",
    name: "Westsides",
    code: "WS",
    description: "Wholesale & retail",
  },
];
export type Scope = {
  company_id: string | null;
  division_id?: string | null;
  branch_id?: string | null;
};
export type Membership = Scope & {
  id: string;
  user_id: string | null;
  email: string;
  name: string;
  role: string;
  active: number;
};
export type Identity = { userId: string; displayName: string; email: string };
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}
export function requireValue(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(message, status);
}
export function textValue(
  value: unknown,
  name: string,
  max = 500,
  required = true,
) {
  requireValue(
    typeof value === "string" || (!required && value == null),
    `${name} must be text.`,
  );
  const s = String(value ?? "").trim();
  requireValue(
    (!required || s.length > 0) && s.length <= max,
    `${name} must be ${required ? "1–" : "at most "}${max} characters.`,
  );
  return s;
}
export function dateValue(value: unknown, name = "Business date") {
  const s = textValue(value, name, 10);
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    `${name} must be a valid date.`,
  );
  return s;
}
export function moneyToMinor(value: unknown) {
  const s = String(value ?? "").trim();
  requireValue(
    /^\d{1,13}(\.\d{1,2})?$/.test(s),
    "Enter a positive amount with at most two decimal places.",
  );
  const [whole, fraction = ""] = s.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  requireValue(
    Number.isSafeInteger(amount) && amount <= 900000000000000,
    "The amount exceeds the supported limit.",
  );
  return amount;
}
export function money(amount: number | string, currency = "TZS") {
  const n = BigInt(amount),
    whole = n / 100n,
    fraction = n % 100n;
  return `${currency} ${new Intl.NumberFormat("en").format(whole)}${fraction ? "." + String(fraction).padStart(2, "0") : ""}`;
}
export function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Dar_es_Salaam",
  }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
}
export function businessToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function matchesScope(m: Scope, s: Scope) {
  return (
    (!m.company_id || m.company_id === s.company_id) &&
    (!m.division_id || m.division_id === s.division_id) &&
    (!m.branch_id || m.branch_id === s.branch_id)
  );
}
export function permitted(
  memberships: Membership[],
  scope: Scope,
  action = "view",
) {
  return memberships.some(
    (m) =>
      m.active &&
      matchesScope(m, scope) &&
      (action === "view" ||
        (action === "record" && ["admin", "recorder"].includes(m.role)) ||
        (action === "review" && m.role === "reviewer") ||
        (action === "admin" && m.role === "admin")),
  );
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function validateRecord(input: Record<string, unknown>) {
  const kind = textValue(input.kind, "Record type", 20);
  requireValue(
    (RECORD_KINDS as readonly string[]).includes(kind),
    "Choose a valid record type.",
  );
  const company_id = textValue(input.company_id, "Company", 100),
    division_id = input.division_id
      ? textValue(input.division_id, "Division", 100)
      : null,
    branch_id = input.branch_id
      ? textValue(input.branch_id, "Branch", 100)
      : null;
  requireValue(!branch_id || division_id, "Choose a division before a branch.");
  const business_date = dateValue(input.business_date),
    end_date = input.end_date ? dateValue(input.end_date, "Period end") : null;
  requireValue(
    !end_date || end_date >= business_date,
    "Period end must follow the start date.",
  );
  const amount_minor = moneyToMinor(input.amount),
    no_activity = input.no_activity === true ? 1 : 0;
  requireValue(
    !no_activity || (kind === "sale" && amount_minor === 0),
    "Confirmed no activity requires a zero sales record.",
  );
  requireValue(
    amount_minor > 0 || no_activity,
    "Use confirmed no activity for a zero sales posting.",
  );
  const currency = textValue(input.currency ?? "TZS", "Currency", 3);
  requireValue(
    ["TZS", "USD", "KES", "EUR", "GBP"].includes(currency),
    "Choose a supported currency.",
  );
  const details = input.details ?? {};
  requireValue(
    typeof details === "object" && !Array.isArray(details) && details !== null,
    "Details must be an object.",
  );
  requireValue(
    Object.keys(details).length <= 20 &&
      Object.values(details).every(
        (v) => typeof v === "string" && v.length <= 500,
      ),
    "Business details are too long.",
  );
  return {
    company_id,
    division_id,
    branch_id,
    kind,
    title: textValue(input.title, "Title", 160),
    business_date,
    end_date,
    amount_minor,
    currency,
    category: textValue(input.category, "Category", 100),
    purpose: textValue(input.purpose, "Purpose", 3000),
    counterparty: textValue(input.counterparty, "Counterparty", 200, false),
    source_reference: textValue(
      input.source_reference,
      "Source reference",
      150,
      kind === "invoice",
    ),
    related_id: input.related_id
      ? textValue(input.related_id, "Related record", 100)
      : null,
    counterparty_company_id: input.counterparty_company_id
      ? textValue(input.counterparty_company_id, "Related company", 100)
      : null,
    details: JSON.stringify(details),
    no_activity,
  };
}
