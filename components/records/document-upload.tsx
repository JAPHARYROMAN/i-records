"use client";
import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { businessToday } from "@/lib/records-domain";
import type { Scope } from "@/lib/records-domain";
import type { BusinessRecord, WorkspaceData } from "@/lib/records-types";
import { Choice, Field, ScopeFields } from "./shared";
export function DocumentUpload({
  data,
  company,
  record,
  onClose,
  onSaved,
}: {
  data: WorkspaceData;
  company: string;
  record?: BusinessRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<Scope>(
      record
        ? {
            company_id: record.company_id,
            division_id: record.division_id,
            branch_id: record.branch_id,
          }
        : {
            company_id:
              company !== "all" ? company : data.companies[0]?.id || null,
            division_id: null,
            branch_id: null,
          },
    ),
    [file, setFile] = useState<File | null>(null),
    [type, setType] = useState("Supporting document"),
    [date, setDate] = useState(record?.business_date || businessToday()),
    [reference, setReference] = useState(""),
    [description, setDescription] = useState(""),
    [physical, setPhysical] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      for (const [k, v] of Object.entries(scope))
        if (["company_id", "division_id", "branch_id"].includes(k))
          form.set(k, String(v || ""));
      if (record) form.set("record_id", record.id);
      form.set("document_type", type);
      form.set("document_date", date);
      form.set("reference", reference);
      form.set("description", description);
      form.set("physical_location", physical);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      toast.success("Document safely archived");
      onSaved();
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
      <DialogContent className="upload-modal">
        <DialogHeader>
          <div className="modal-kicker">
            <UploadCloud size={17} />
            DOCUMENT ARCHIVE
          </div>
          <DialogTitle>
            {record ? "Attach supporting evidence" : "Keep a document"}
          </DialogTitle>
          <DialogDescription>
            {record
              ? record.title
              : "Preserve the original and make it easy to find later."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <fieldset disabled={busy} className="entry-fields">
            <ScopeFields
              data={data}
              scope={scope}
              onChange={setScope}
              allowGroup={
                !record &&
                data.memberships.some(
                  (m) =>
                    !m.company_id && ["admin", "recorder"].includes(m.role),
                )
              }
              disabled={!!record}
            />
            <div className="upload-zone">
              <UploadCloud size={30} />
              <Label htmlFor="archive-file">Choose your document</Label>
              <input
                id="archive-file"
                type="file"
                required
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <p>PDF, PNG, or JPG · up to 20 MB</p>
            </div>
            <div className="form-grid">
              <Choice
                label="Document type"
                value={type}
                onChange={setType}
                options={[
                  "Supporting document",
                  "Invoice",
                  "Receipt",
                  "Daily report",
                  "Contract",
                  "Licence",
                  "Group policy",
                  "Correspondence",
                  "Other",
                ].map((v) => ({ value: v, label: v }))}
              />
              <Field
                label="Document date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <Field
              label="Reference (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <Field
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <details className="more-details">
              <summary>Paper original location</summary>
              <Field
                label="Office / cabinet / file / box"
                value={physical}
                onChange={(e) => setPhysical(e.target.value)}
              />
            </details>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !file}>
              {busy ? "Archiving…" : "Archive document"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
