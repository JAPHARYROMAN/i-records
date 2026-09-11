"use client";
import { useEffect, useState } from "react";
import { ArrowRight, FileText, LoaderCircle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { businessToday, KIND_LABELS, permitted } from "@/lib/records-domain";
import type { Scope } from "@/lib/records-domain";
import type { BusinessRecord, WorkspaceData } from "@/lib/records-types";
import { api, Choice, Field, ScopeFields } from "./shared";

const categories: Record<string, string[]> = {
  sale: [
    "Daily sales",
    "Revenue summary",
    "Transport revenue",
    "Crop sales",
    "Construction revenue",
  ],
  purchase: [
    "Stock purchase",
    "Fuel purchase",
    "Materials",
    "Equipment",
    "Other purchase",
  ],
  expense: [
    "Operations",
    "Maintenance",
    "Transport",
    "Utilities",
    "Professional services",
    "Staff costs",
    "Other expense",
  ],
  invoice: ["Supplier invoice", "Customer invoice"],
  payment: ["Supplier payment", "Expense settlement", "Other payment"],
  collection: ["Customer collection", "Invoice settlement", "Other collection"],
};
const profileFields: Record<string, string[]> = {
  petroleum: ["Fuel type", "Quantity (litres)", "Shift"],
  logistics: ["Vehicle", "Trip reference", "Route"],
  agriculture: ["Farm", "Crop", "Season"],
  construction: ["Project", "Contract", "Work stage"],
  trading: ["Product category", "Sales channel"],
  general: [],
};
export function RecordForm({
  data,
  company,
  kind = "expense",
  record,
  onClose,
  onSaved,
}: {
  data: WorkspaceData;
  company: string;
  kind?: string;
  record?: BusinessRecord;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const eligible = data.companies.filter((c) =>
    data.memberships.some(
      (m) =>
        (!m.company_id || m.company_id === c.id) &&
        ["admin", "recorder"].includes(m.role),
    ),
  );
  const defaultCompany = company !== "all" ? company : eligible[0]?.id || "";
  const assignment = data.memberships.find(
    (m) =>
      ["admin", "recorder"].includes(m.role) &&
      (!m.company_id || m.company_id === defaultCompany),
  );
  const [scope, setScope] = useState<Scope>(
    record
      ? {
          company_id: record.company_id,
          division_id: record.division_id,
          branch_id: record.branch_id,
        }
      : {
          company_id: defaultCompany,
          division_id: assignment?.division_id || null,
          branch_id: assignment?.branch_id || null,
        },
  );
  const [recordKind, setKind] = useState(record?.kind || kind),
    [title, setTitle] = useState(record?.title || ""),
    [date, setDate] = useState(record?.business_date || businessToday()),
    [endDate, setEndDate] = useState(record?.end_date || "");
  const [amount, setAmount] = useState(
      record ? String(record.amount_minor / 100) : "",
    ),
    [currency, setCurrency] = useState(record?.currency || "TZS"),
    [category, setCategory] = useState(record?.category || categories[kind][0]);
  const [purpose, setPurpose] = useState(record?.purpose || ""),
    [counterparty, setCounterparty] = useState(record?.counterparty || ""),
    [reference, setReference] = useState(record?.source_reference || "");
  const [details, setDetails] = useState<Record<string, string>>(
      JSON.parse(record?.details || "{}"),
    ),
    [noActivity, setNoActivity] = useState(!!record?.no_activity),
    [internalCompany, setInternalCompany] = useState(
      record?.counterparty_company_id || "",
    );
  const [related, setRelated] = useState(record?.related_id || ""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [id] = useState(record?.id || crypto.randomUUID()),
    [savedVersion, setSavedVersion] = useState<number | undefined>(
      record?.version,
    ),
    [uploaded, setUploaded] = useState(false);
  const profile =
    data.divisions.find((d) => d.id === scope.division_id)?.profile ||
    "general";
  const [moreOpen, setMoreOpen] = useState(false);
  const [relatedQuery, setRelatedQuery] = useState("");
  const [relatedChoices, setRelatedChoices] = useState<BusinessRecord[]>([]);
  useEffect(() => {
    if (!moreOpen || !scope.company_id) return;
    let active = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({company: scope.company_id!, q: relatedQuery, limit: "100"});
      api<{records:BusinessRecord[]}>(`records?${params}`).then(result => {
        if (active) setRelatedChoices(result.records.filter(candidate => candidate.id !== id));
      }).catch(() => { if (active) setRelatedChoices([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [moreOpen, scope.company_id, relatedQuery, id]);
  async function save(submit: boolean) {
    setBusy(true);
    setError("");
    try {
      if (!permitted(data.memberships, scope, "record"))
        throw new Error(
          "Select a company, division, or branch where you have recording access.",
        );
      {
        await api("records", {
          id,
          version: savedVersion,
          ...scope,
          kind: recordKind,
          title,
          business_date: date,
          end_date: endDate || null,
          amount: noActivity ? "0" : amount,
          currency,
          category,
          purpose,
          counterparty,
          source_reference: reference,
          details,
          no_activity: noActivity,
          related_id: related || null,
          counterparty_company_id: internalCompany || null,
        });
        const saved = await api<{ record: BusinessRecord }>(`records/${id}`);
        setSavedVersion(saved.record.version);
        if (file && !uploaded) {
          const form = new FormData();
          form.set("file", file);
          form.set("record_id", id);
          form.set("company_id", scope.company_id || "");
          form.set("division_id", scope.division_id || "");
          form.set("branch_id", scope.branch_id || "");
          form.set("document_date", date);
          form.set("document_type", "Supporting document");
          const res = await fetch("/api/documents", {
            method: "POST",
            body: form,
          });
          const output = (await res.json()) as { error?: string };
          if (!res.ok) throw new Error(`Draft saved. ${output.error}`);
        }
        setUploaded(true);
      }
      if (submit) {
        const latest = await api<{ record: BusinessRecord }>(`records/${id}`);
        await api(`records/${id}/action`, {
          action: "submit",
          version: latest.record.version,
        });
      }
      toast.success(submit ? "Record submitted for review" : "Draft saved");
      onSaved(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="record-modal">
        <DialogHeader>
          <div className="modal-kicker">
            <FileText size={16} /> {record ? record.number : "NEW RECORD"}
          </div>
          <DialogTitle>
            {record ? "Edit record" : "Record what happened"}
          </DialogTitle>
          <DialogDescription>
            Keep the facts clear and the evidence close.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
          className="record-entry"
        >
          <fieldset disabled={busy} className="entry-fields">
            <ScopeFields
              data={{ ...data, companies: eligible }}
              scope={scope}
              onChange={(s) => {
                setScope(s);
                setDetails({});
                setRelated("");
                setInternalCompany("");
              }}
              disabled={!!record?.supersedes_id || !!record?.document_count}
            />
            <div className="form-grid">
              <Choice
                label="Record type"
                value={recordKind}
                disabled={!!record?.supersedes_id}
                onChange={(v) => {
                  setKind(v);
                  setCategory(categories[v][0]);
                  setNoActivity(false);
                }}
                options={Object.entries(KIND_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <Field
                label="Business date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <Field
              label="Record title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                recordKind === "expense"
                  ? "e.g. Office electricity — September"
                  : "A short, clear description"
              }
              maxLength={160}
              required
            />
            <div className="form-grid amount-grid">
              <Field
                label="Amount"
                inputMode="decimal"
                value={noActivity ? "0" : amount}
                disabled={noActivity}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
              <Choice
                label="Currency"
                value={currency}
                onChange={setCurrency}
                options={["TZS", "USD", "KES", "EUR", "GBP"].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
            </div>
            {recordKind === "sale" && (
              <Label className="check-line">
                <Checkbox
                  checked={noActivity}
                  onCheckedChange={(v) => setNoActivity(v === true)}
                />{" "}
                Confirm no sales activity for this period
              </Label>
            )}
            <div className="form-grid">
              <Field
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="record-categories"
                required
              />
              <datalist id="record-categories">
                {categories[recordKind].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <Field
                label={
                  recordKind === "invoice"
                    ? "Invoice number"
                    : "Source reference (optional)"
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Invoice, report, or receipt reference"
                required={recordKind === "invoice"}
              />
            </div>
            <div className="field">
              <Label htmlFor="record-purpose">
                {recordKind === "expense"
                  ? "What was this expense used for?"
                  : "Purpose / explanation"}
              </Label>
              <Textarea
                id="record-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Enough detail for someone to understand this record later."
                rows={3}
                maxLength={3000}
                required
              />
            </div>
            {profileFields[profile]?.length > 0 && (
              <div className="business-fields">
                <div className="small-label">BUSINESS DETAILS</div>
                <div className="form-grid">
                  {profileFields[profile].map((field) => (
                    <Field
                      label={field}
                      key={field}
                      value={details[field] || ""}
                      onChange={(e) =>
                        setDetails({ ...details, [field]: e.target.value })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <Label htmlFor="record-file">
                <Paperclip size={15} /> Supporting document (optional)
              </Label>
              <input
                id="record-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setUploaded(false);
                }}
                className="file-input"
              />
              <p className="field-hint">
                PDF, PNG, or JPG · up to 20 MB. You can add evidence later.
              </p>
            </div>
            <details className="more-details" onToggle={event => setMoreOpen(event.currentTarget.open)}>
              <summary>Additional details</summary>
              <div className="form-grid">
                <Field
                  label="Customer / supplier / beneficiary"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                />
                <Field
                  label="Period end (summary records only)"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <Choice
                  label="Internal counterparty"
                  value={internalCompany}
                  onChange={setInternalCompany}
                  options={[
                    { value: "", label: "External / not applicable" },
                    ...data.companies
                      .filter((c) => c.id !== scope.company_id)
                      .map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
                <Field label="Find a related record" value={relatedQuery} onChange={event => setRelatedQuery(event.target.value)} placeholder="Search a title or invoice reference" />
                <Choice label="Related record (optional)" value={related} onChange={setRelated} options={[{value:"",label:"No linked record"}, ...relatedChoices.map(candidate => ({value:candidate.id,label:`${candidate.number} · ${candidate.title}`})), ...(related&&!relatedChoices.some(candidate=>candidate.id===related)?[{value:related,label:"Current linked record"}]:[])]} />
              </div>
              <p className="field-hint">
                Invoices and settlements remain separate from recorded sales and
                costs. Summary amounts are never divided into assumed daily
                figures.
              </p>
            </details>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button
              variant="ghost"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button variant="outline" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : null}
              Save draft
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                const form =
                  document.querySelector<HTMLFormElement>(".record-entry");
                if (form?.reportValidity()) void save(true);
              }}
            >
              Submit for review <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
