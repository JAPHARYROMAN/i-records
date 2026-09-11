"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  FileText,
  History,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KIND_LABELS, money, permitted, shortDate } from "@/lib/records-domain";
import type {
  BusinessRecord,
  RecordDetail,
  WorkspaceData,
} from "@/lib/records-types";
import { api, Busy, Status } from "./shared";

export function RecordDetailPanel({
  id,
  data,
  onClose,
  onEdit,
  onUpload,
  onChanged,
  onOpen,
}: {
  id: string;
  data: WorkspaceData;
  onClose: () => void;
  onEdit: (r: BusinessRecord) => void;
  onUpload: (r: BusinessRecord) => void;
  onChanged: () => void;
  onOpen: (id: string) => void;
}) {
  const [detail, setDetail] = useState<RecordDetail | null>(null),
    [error, setError] = useState(""),
    [action, setAction] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setDetail(await api<RecordDetail>(`records/${id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setDetail(null);
    void load();
  }, [id]);
  async function perform(value: string) {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await api<{ id: string }>(`records/${id}/action`, {
        action: value,
        reason,
        version: detail.record.version,
      });
      setAction("");
      setReason("");
      toast.success(
        value === "correct" ? "Correction draft created" : "Record updated",
      );
      onChanged();
      if (value === "correct") {
        const next = await api<RecordDetail>(`records/${result.id}`);
        onEdit(next.record);
      } else await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const r = detail?.record,
    canRecord = r && permitted(data.memberships, r, "record"),
    canReview = r && permitted(data.memberships, r, "review"),
    author = r?.created_by === data.user?.userId;
  const titles: Record<string, string> = {
    approve: "Approve and post",
    return: "Return for correction",
    correct: "Start a correction",
    void: "Void this record",
    discard: "Discard this draft",
  };
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent className="detail-sheet">
          <SheetHeader>
            <div className="modal-kicker">
              <FileText size={16} />
              {r?.number || "RECORD"}
            </div>
            <SheetTitle>{r?.title || "Record details"}</SheetTitle>
            <SheetDescription>
              {r
                ? Object.values(JSON.parse(r.scope_snapshot))
                    .filter(Boolean)
                    .join(" / ")
                : "Facts, evidence, and history."}
            </SheetDescription>
          </SheetHeader>
          {error ? (
            <p className="form-error">{error}</p>
          ) : !detail || !r ? (
            <Busy />
          ) : (
            <div className="detail-body">
              <div className="record-amount">
                <div>
                  <span className="small-label">{KIND_LABELS[r.kind]}</span>
                  <h2>{money(r.amount_minor, r.currency)}</h2>
                  <p>
                    {shortDate(r.business_date)}
                    {r.end_date ? ` – ${shortDate(r.end_date)}` : ""}
                  </p>
                </div>
                <Status value={r.status} />
              </div>
              <div className="record-actions">
                {canRecord &&
                  author &&
                  ["draft", "returned"].includes(r.status) && (
                    <>
                      <Button onClick={() => onEdit(r)} variant="outline">
                        <Pencil size={15} />
                        Edit draft
                      </Button>
                      <Button disabled={busy} onClick={() => perform("submit")}>
                        <Send size={15} />
                        Submit
                      </Button>
                    </>
                  )}
                {canRecord && author && r.status === "submitted" && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => perform("withdraw")}
                  >
                    Withdraw submission
                  </Button>
                )}
                {canReview && !author && r.status === "submitted" && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => setAction("approve")}
                    >
                      <Check size={15} />
                      Approve & post
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setAction("return")}
                    >
                      Return
                    </Button>
                  </>
                )}
                {canRecord && r.status === "approved" && (
                  <Button
                    variant="outline"
                    onClick={() => setAction("correct")}
                  >
                    <RotateCcw size={15} />
                    Correct record
                  </Button>
                )}
              </div>
              {author && r.status === "submitted" && (
                <p className="info-note">
                  <ShieldCheck size={17} /> Another authorized reviewer must
                  approve this submission.
                </p>
              )}
              {r.correction_reason && (
                <p className="info-note">Correction: {r.correction_reason}</p>
              )}
              <Tabs defaultValue="record">
                <TabsList className="detail-tabs">
                  <TabsTrigger value="record">Record</TabsTrigger>
                  <TabsTrigger value="evidence">
                    Evidence <span>{detail.documents.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                <TabsContent value="record">
                  <div className="detail-section">
                    <h3>Purpose / explanation</h3>
                    <p className="purpose-copy">{r.purpose}</p>
                  </div>
                  <dl className="detail-grid">
                    <div>
                      <dt>Category</dt>
                      <dd>{r.category}</dd>
                    </div>
                    <div>
                      <dt>Source reference</dt>
                      <dd>{r.source_reference || "Not provided"}</dd>
                    </div>
                    <div>
                      <dt>Counterparty</dt>
                      <dd>{r.counterparty || "Not provided"}</dd>
                    </div>
                    <div>
                      <dt>Recorded by</dt>
                      <dd>{r.created_name}</dd>
                    </div>
                    <div>
                      <dt>Entered</dt>
                      <dd>{shortDate(r.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Version</dt>
                      <dd>{r.version}</dd>
                    </div>
                    {Object.entries(
                      JSON.parse(r.details) as Record<string, string>,
                    )
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                  </dl>
                  {r.no_activity === 1 && (
                    <p className="info-note">
                      Confirmed no sales activity for the recorded period.
                    </p>
                  )}
                  {r.evidence_exception && (
                    <div className="detail-section">
                      <h3>Evidence exception</h3>
                      <p>{r.evidence_exception}</p>
                    </div>
                  )}
                  {detail.related.length > 0 && (
                    <div className="detail-section">
                      <h3>Linked records</h3>
                      {detail.related.map((other) => (
                        <button
                          className="linked-record"
                          onClick={() => onOpen(other.id)}
                          key={other.id}
                        >
                          <FileText size={16} />
                          <span>
                            {other.number} · {other.title}
                          </span>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                    </div>
                  )}
                  <details className="more-details">
                    <summary>Record controls</summary>
                    <p className="field-hint selectable">Record ID: {r.id}</p>
                    {canRecord &&
                      author &&
                      ["draft", "returned"].includes(r.status) && (
                        <Button
                          variant="outline"
                          onClick={() => setAction("discard")}
                        >
                          Discard draft
                        </Button>
                      )}
                    {canReview && !author && r.status === "approved" && (
                      <Button
                        variant="outline"
                        onClick={() => setAction("void")}
                      >
                        Void record
                      </Button>
                    )}
                  </details>
                </TabsContent>
                <TabsContent value="evidence">
                  <div className="detail-section">
                    <div className="section-heading">
                      <h3>Supporting documents</h3>
                      {canRecord &&
                        !["superseded", "voided"].includes(r.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onUpload(r)}
                          >
                            <Paperclip size={14} />
                            Add evidence
                          </Button>
                        )}
                    </div>
                    {!detail.documents.length ? (
                      <div className="evidence-empty">
                        <FileText size={27} />
                        <h3>No evidence attached</h3>
                        <p>
                          Add the source document so this record can be
                          verified.
                        </p>
                      </div>
                    ) : (
                      detail.documents.map((d) => (
                        <div className="evidence-row" key={d.id}>
                          <span className="quick-icon">
                            <FileText size={19} />
                          </span>
                          <div>
                            <a
                              href={`/api/documents/${d.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {d.name}
                            </a>
                            <small>
                              {d.document_type} ·{" "}
                              {Math.max(1, Math.round(d.size / 1024))} KB
                            </small>
                            <small>Archived {shortDate(d.created_at)}</small>
                          </div>
                          <a
                            aria-label={`Download ${d.name}`}
                            href={`/api/documents/${d.id}?download=1`}
                          >
                            <Download size={17} />
                          </a>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="history">
                  <div className="history-list">
                    {detail.history.map((h) => (
                      <article key={h.id} className="history-event">
                        <span className="history-mark">
                          <History size={15} />
                        </span>
                        <div>
                          <h3>{h.action}</h3>
                          <p>
                            {h.actor_name} ·{" "}
                            {new Date(h.created_at).toLocaleString("en-GB", {
                              timeZone: "Africa/Dar_es_Salaam",
                            })}
                          </p>
                          {h.reason && <blockquote>{h.reason}</blockquote>}
                          {h.snapshot && (
                            <details>
                              <summary>View recorded details</summary>
                              <pre>
                                {JSON.stringify(
                                  JSON.parse(h.snapshot),
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titles[action] || "Update record"}</DialogTitle>
            <DialogDescription>
              {action === "approve"
                ? "This accepts the record into the approved historical register."
                : action === "correct"
                  ? "The original stays effective until the correction is reviewed and approved."
                  : "The original and its history will remain available."}
            </DialogDescription>
          </DialogHeader>
          <div className="field">
            <Label htmlFor="action-reason">
              {action === "approve" && detail?.documents.length
                ? "Review note (optional)"
                : action === "approve"
                  ? "Reason for approving without evidence"
                  : "Reason"}
            </Label>
            <Textarea
              id="action-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain this decision."
            />
          </div>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setAction("")}>
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                (!reason.trim() &&
                  !(action === "approve" && detail?.documents.length))
              }
              onClick={() => perform(action)}
            >
              {busy ? "Saving…" : titles[action]}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
