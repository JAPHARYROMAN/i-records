"use client";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  FolderOpen,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, permitted } from "@/lib/records-domain";
import type { RecordList, WorkspaceData } from "@/lib/records-types";
import { RecordTable } from "./record-table";
export function Overview({
  data,
  list,
  company,
  onSetup,
  onRecords,
  onCreate,
  onUpload,
  onOpen,
}: {
  data: WorkspaceData;
  list: RecordList;
  company: string;
  onSetup: (company?: string) => void;
  onRecords: () => void;
  onCreate: (kind: string) => void;
  onUpload: () => void;
  onOpen: (id: string) => void;
}) {
  const companies = data.companies.filter(
      (c) => company === "all" || c.id === company,
    ),
    canCreate = data.memberships.some((m) =>
      ["admin", "recorder"].includes(m.role),
    ),
    hasSetup = data.divisions.length > 0;
  return (
    <>
      {!hasSetup && (
        <section className="welcome-panel">
          <div className="welcome-symbol">
            <FolderOpen size={28} />
          </div>
          <div>
            <span className="small-label">A GOOD PLACE TO START</span>
            <h2>Your companies are ready. Make this workspace yours.</h2>
            <p>
              Add divisions and branches when you’re ready, or start with a
              company-wide record.
            </p>
          </div>
          <Button variant="outline" onClick={() => onSetup()}>
            Set up your organization <ArrowUpRight size={16} />
          </Button>
        </section>
      )}
      <section className="metrics-grid">
        {[
          {
            label: "Recorded sales",
            kind: "sale",
            icon: ArrowUpRight,
            tone: "blue",
          },
          {
            label: "Recorded purchases",
            kind: "purchase",
            icon: ArrowDownLeft,
            tone: "violet",
          },
          {
            label: "Recorded expenses",
            kind: "expense",
            icon: Wallet,
            tone: "orange",
          },
          {
            label: "Awaiting review",
            kind: "review",
            icon: CheckCheck,
            tone: "green",
          },
        ].map((m) => {
          const totals = list.summary.filter((s) => s.kind === m.kind);
          return (
            <article className="metric" key={m.kind}>
              <div className="metric-top">
                <span>{m.label}</span>
                <span className={`metric-icon ${m.tone}`}>
                  <m.icon size={18} />
                </span>
              </div>
              {m.kind === "review" ? (
                <div className="metric-value">{list.pending}</div>
              ) : totals.length ? (
                <div className="metric-amounts">
                  {totals.map((t) => (
                    <div key={t.currency}>
                      {money(t.amount_minor, t.currency)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="metric-value">—</div>
              )}
              <div className="metric-note">
                {m.kind === "review"
                  ? list.pending
                    ? "Submissions waiting for a decision"
                    : "Your review queue is clear"
                  : totals.length
                    ? `${totals.reduce((n, t) => n + t.count, 0)} approved records`
                    : "No approved records yet"}
              </div>
            </article>
          );
        })}
      </section>
      <section className="section-block">
        <div className="section-heading">
          <h2>
            Your companies{" "}
            <span className="count-badge">{companies.length}</span>
          </h2>
          <button className="text-action" onClick={() => onSetup()}>
            Manage companies <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="companies-grid">
          {companies.map((c) => {
            const divisions = data.divisions.filter(
                (d) => d.company_id === c.id,
              ),
              branches = data.branches.filter((b) => b.company_id === c.id);
            const color =
              c.id === "mwanjalisi"
                ? "oil"
                : c.id === "itemba"
                  ? "enterprise"
                  : "west";
            return (
              <button
                className={`company-card ${color}`}
                key={c.id}
                onClick={() => onSetup(c.id)}
              >
                <div className="company-card-top">
                  <span className={`company-monogram ${color}`}>{c.code}</span>
                  <span className="setup-badge">
                    {divisions.length ? "Configured" : "Setup pending"}
                  </span>
                </div>
                <h3>{c.name}</h3>
                <p>{c.description}</p>
                <div className="company-card-footer">
                  <span>
                    {divisions.length
                      ? `${divisions.length} divisions · ${branches.length} branches`
                      : "Divisions & branches to be added"}
                  </span>
                  <ChevronRight size={17} />
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <div className="overview-bottom">
        <section className="records-panel">
          <div className="section-heading">
            <h2>Recent records</h2>
            <button className="text-action" onClick={onRecords}>
              View all <ArrowUpRight size={15} />
            </button>
          </div>
          <RecordTable
            records={list.records.slice(0, 5)}
            onOpen={onOpen}
            onCreate={canCreate ? () => onCreate("expense") : undefined}
            emptyTitle="Your history starts here"
            emptyDescription="Record your first sale, purchase, invoice, or expense. Keep its supporting documents close by."
          />
        </section>
        <aside className="quick-panel">
          <h2>Keep things moving</h2>
          <p>A few simple actions for everyday work.</p>
          {canCreate &&
            [
              {
                label: "Record daily sales",
                sub: "Capture a completed business day",
                icon: ArrowUpRight,
                kind: "sale",
              },
              {
                label: "Record an expense",
                sub: "Remember what it was used for",
                icon: Wallet,
                kind: "expense",
              },
              {
                label: "Add a document",
                sub: "Keep the evidence in one place",
                icon: FolderOpen,
                kind: "document",
              },
            ].map((a) => (
              <button
                className="quick-action"
                key={a.label}
                onClick={() =>
                  a.kind === "document" ? onUpload() : onCreate(a.kind)
                }
              >
                <span className="quick-icon">
                  <a.icon size={19} />
                </span>
                <span>
                  <strong>{a.label}</strong>
                  <small>{a.sub}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          <div className="coverage-note">
            <CircleHelp size={17} />
            <span>
              {data.expectations.some((e) => e.active)
                ? "View the latest expected submissions in Reviews."
                : "Reporting expectations will appear after setup."}
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}
