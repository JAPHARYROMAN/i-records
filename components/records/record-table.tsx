"use client";
import { ArrowUpRight, FileText, Paperclip } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KIND_LABELS, money, shortDate } from "@/lib/records-domain";
import type { BusinessRecord } from "@/lib/records-types";
import { EmptyState, Status } from "./shared";
export function RecordTable({
  records,
  onOpen,
  onCreate,
  emptyTitle = "No records here yet",
  emptyDescription = "Start with a sales summary, purchase, invoice, or expense.",
}: {
  records: BusinessRecord[];
  onOpen: (id: string) => void;
  onCreate?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!records.length)
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={onCreate ? "Create a record" : undefined}
        onAction={onCreate}
      />
    );
  return (
    <Table className="business-table">
      <TableHeader>
        <TableRow>
          <TableHead>Record</TableHead>
          <TableHead>Company / unit</TableHead>
          <TableHead>Business date</TableHead>
          <TableHead className="amount-cell">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Evidence</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((r) => {
          const scope = JSON.parse(r.scope_snapshot);
          return (
            <TableRow key={r.id}>
              <TableCell>
                <button
                  className="record-title-button"
                  onClick={() => onOpen(r.id)}
                >
                  <span className={`record-type-icon ${r.kind}`}>
                    <FileText size={17} />
                  </span>
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.number} · {KIND_LABELS[r.kind]}
                    </small>
                  </span>
                </button>
              </TableCell>
              <TableCell>
                <span className="company-cell">{scope.company}</span>
                <small className="cell-subtitle">
                  {scope.branch || scope.division || "Company-wide"}
                </small>
              </TableCell>
              <TableCell className="date-cell">
                {shortDate(r.business_date)}
                {r.end_date && (
                  <small className="cell-subtitle">
                    to {shortDate(r.end_date)}
                  </small>
                )}
              </TableCell>
              <TableCell className="amount-cell">
                <strong>{money(r.amount_minor, r.currency)}</strong>
              </TableCell>
              <TableCell>
                <Status value={r.status} />
              </TableCell>
              <TableCell>
                {r.document_count ? (
                  <span className="evidence-count">
                    <Paperclip size={14} />
                    {r.document_count}
                  </span>
                ) : (
                  <span
                    className="missing-evidence"
                    title="No evidence attached"
                  >
                    —
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
