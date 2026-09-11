"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  Building2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  FileClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { KIND_LABELS, shortDate } from "@/lib/records-domain";
import type {
  BusinessRecord,
  Evidence,
  RecordList,
  WorkspaceData,
} from "@/lib/records-types";
import {
  api,
  Busy,
  Choice,
  EmptyState,
  Field,
  resolvedPeriod,
  scopeLabel,
} from "./shared";
import { RecordForm } from "./record-form";
import { RecordDetailPanel } from "./record-detail";
import { DocumentUpload } from "./document-upload";
import { Setup } from "./setup";
import { Overview } from "./overview";
import { RecordTable } from "./record-table";
import { Coverage } from "./coverage";

const navigation = [
  { name: "Overview", icon: LayoutDashboard, id: "overview" },
  { name: "Records", icon: FileText, id: "records" },
  { name: "Document archive", icon: Archive, id: "archive" },
  { name: "Reviews", icon: CheckCheck, id: "reviews" },
  { name: "Historical explorer", icon: FileClock, id: "explorer" },
];
const subtitles: Record<string, string> = {
  overview: "A clear view of your business records, all in one place.",
  records: "Record what happened. Keep the details that matter.",
  archive: "Original documents, organized and always within reach.",
  reviews: "A second look today. A dependable history tomorrow.",
  explorer: "Find what happened, when it happened, and the evidence behind it.",
  setup: "One group. Three companies. A structure that grows with you.",
};
const emptyList: RecordList = {
  records: [],
  total: 0,
  summary: [],
  pending: 0,
};
export function Workspace() {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "248px" } as React.CSSProperties}
    >
      <WorkspaceContent />
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  );
}
function WorkspaceContent() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [view, setView] = useState("overview"),
    [company, setCompany] = useState("all"),
    [list, setList] = useState<RecordList>(emptyList),
    [documents, setDocuments] = useState<Evidence[]>([]),
    [documentTotal, setDocumentTotal] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [authRequired, setAuthRequired] = useState(false),
    [refresh, setRefresh] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [status, setStatus] = useState("all"),
    [period, setPeriod] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null),
    [form, setForm] = useState<{
      kind: string;
      record?: BusinessRecord;
    } | null>(null),
    [upload, setUpload] = useState<{ record?: BusinessRecord } | null>(null),
    [detailKey, setDetailKey] = useState(0);
  const sidebar = useSidebar();
  const changed = () => {
    setRefresh((v) => v + 1);
    setDetailKey((v) => v + 1);
  };
  function navigate(next: string, scope?: string) {
    setView(next);
    setSearch("");
    setQuery("");
    setStatus(next === "explorer" ? "approved" : "all");
    setKind("all");
    setOffset(0);
    setSelected(null);
    setPeriod("all");
    setFrom("");
    setTo("");
    if (scope) setCompany(scope);
    sidebar.setOpenMobile(false);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    url.searchParams.delete("record");
    if (scope) url.searchParams.set("company", scope);
    window.history.pushState({}, "", url);
  }
  useEffect(() => {
    function restore() {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      if (v && [...navigation.map((n) => n.id), "setup"].includes(v))
        setView(v);
      else setView("overview");
      setCompany(params.get("company") || "all");
      setSelected(params.get("record"));
      setStatus(v === "explorer" ? "approved" : "all");
    }
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let result = await api<WorkspaceData>("workspace");
        if (!result.initialized) {
          await api("initialize", {});
          result = await api<WorkspaceData>("workspace");
        }
        if (active) {
          setData(result);
          setAuthRequired(false);
          setError("");
        }
      } catch (e) {
        if (active) {
          const message = (e as Error).message;
          setAuthRequired(message.includes("Sign in"));
          setError(message);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [refresh]);
  const params = useMemo(() => {
    const p = new URLSearchParams({
      company,
      kind,
      status: view === "reviews" ? "submitted" : status,
      offset: String(offset),
    });
    if (query) p.set("q", query);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }, [company, kind, status, view, offset, query, from, to]);
  useEffect(() => {
    if (!data) return;
    let active = true;
    setLoading(true);
    async function load() {
      try {
        if (view === "archive") {
          const result = await api<{ documents: Evidence[]; total: number }>(
            `documents?${params}`,
          );
          if (active) {
            setDocuments(result.documents);
            setDocumentTotal(result.total);
          }
        } else {
          const result = await api<RecordList>(`records?${params}`);
          if (active) setList(result);
        }
        if (active) setError("");
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [data, params, view, refresh]);
  function openRecord(id: string) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("record", id);
    window.history.replaceState({}, "", url);
  }
  function closeRecord() {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("record");
    window.history.replaceState({}, "", url);
  }
  useEffect(() => {
    type ToolContext = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as unknown as { modelContext?: ToolContext })
      .modelContext;
    if (!context?.registerTool || !data) return;
    const controller = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "find_business_records",
          title: "Find business records",
          description:
            "Read authorized I-RECORDS entries and display them in the historical explorer. Does not create or approve records.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              company: { type: "string" },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: unknown) => {
            const v = input as { query?: string; company?: string };
            if (
              !v ||
              typeof v !== "object" ||
              (v.query !== undefined && typeof v.query !== "string") ||
              (v.company !== undefined &&
                !data.companies.some((c) => c.id === v.company))
            )
              throw new Error("Choose a valid query and authorized company.");
            const p = new URLSearchParams({
              q: v.query || "",
              company: v.company || "all",
              status: "approved",
            });
            const result = await api<RecordList>(`records?${p}`);
            navigate("explorer", v.company || "all");
            setSearch(v.query || "");
            setQuery(v.query || "");
            setStatus("approved");
            setList(result);
            return {
              total: result.total,
              records: result.records.map((r) => ({
                id: r.id,
                number: r.number,
                title: r.title,
                date: r.business_date,
                amount_minor: r.amount_minor,
                currency: r.currency,
                status: r.status,
              })),
            };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [data]);
  const canCreate = data?.memberships.some((m) =>
    ["admin", "recorder"].includes(m.role),
  );
  if (authRequired)
    return (
      <div className="auth-page">
        <div className="auth-card">
          <span className="auth-logo">
            <Archive size={32} />
          </span>
          <div className="eyebrow">ITEMBA GROUP</div>
          <h1>I-RECORDS</h1>
          <p>
            Your records. Your evidence.
            <br />
            Your business history, together.
          </p>
          <a
            className="auth-button"
            href="/signin-with-chatgpt?return_to=%2F"
            target="_top"
          >
            Sign in to your workspace <ArrowUpRight size={17} />
          </a>
          <small>Use the account assigned access by your administrator.</small>
        </div>
      </div>
    );
  return (
    <>
      <Sidebar className="app-sidebar" role="complementary" aria-label="Workspace sidebar">
        <SidebarHeader className="brand-header">
          <a href="/" className="brand">
            <span className="brand-icon">
              <Archive size={21} />
            </span>
            <span>
              I-RECORDS<span className="brand-caption">ITEMBA GROUP</span>
            </span>
          </a>
        </SidebarHeader>
        <SidebarContent className="sidebar-content">
          <div className="workspace-label">WORKSPACE</div>
          <nav className="main-nav">
            {navigation.map((n) => (
              <button
                key={n.id}
                className={`nav-item ${view === n.id ? "active" : ""}`}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={19} />
                <span>{n.name}</span>
                {view === n.id && <span className="nav-active-dot" />}
                {n.id === "reviews" && list.pending > 0 && (
                  <span className="nav-count">{list.pending}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-divider" />
          <div className="workspace-label">ORGANIZATION</div>
          <button
            className={`nav-item ${view === "setup" ? "active" : ""}`}
            onClick={() => navigate("setup")}
          >
            <Building2 size={19} />
            Companies & setup
          </button>
          <div className="sidebar-note">
            <ShieldCheck size={22} />
            <p>
              A clear record.
              <br />A lasting history.
            </p>
            <span>One workspace for your group.</span>
          </div>
        </SidebarContent>
        <SidebarFooter className="sidebar-footer">
          <div className="avatar">
            {data?.user?.displayName.slice(0, 2).toUpperCase() || "IG"}
          </div>
          <div>
            <strong>
              {data?.user?.userId === "local_seedy"
                ? "Local administrator"
                : data?.user?.displayName || "ITEMBA GROUP"}
            </strong>
            <span>
              {data?.user?.userId === "local_seedy"
                ? "Development preview"
                : "Group workspace"}
            </span>
          </div>
          <a
            href="/signout-with-chatgpt?return_to=%2F"
            target="_top"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </a>
        </SidebarFooter>
      </Sidebar>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-left">
            <SidebarTrigger />
            <span className="breadcrumb">
              Workspace <ChevronRight size={14} />
              <strong>
                {navigation.find((n) => n.id === view)?.name ||
                  "Companies & setup"}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="group-label">
              <Building2 size={16} />
              ITEMBA GROUP
            </span>
            <button
              className="avatar top-avatar"
              aria-label="Open organization setup"
              onClick={() => navigate("setup")}
            >
              IG
            </button>
          </div>
        </header>
        <main className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview"
                  ? "YOUR GROUP, IN VIEW"
                  : "RECORDS · EVIDENCE · HISTORY"}
              </div>
              <h1>
                {navigation.find((n) => n.id === view)?.name ||
                  "Companies & setup"}
              </h1>
              <p>{subtitles[view]}</p>
            </div>
            {data && canCreate && view !== "setup" && (
              <Button
                className="primary-action"
                onClick={() =>
                  view === "archive"
                    ? setUpload({})
                    : setForm({ kind: "expense" })
                }
              >
                <Plus size={17} />
                {view === "archive" ? "Add document" : "New record"}
              </Button>
            )}
          </div>
          {data && (
            <div className="scope-bar">
              <Select
                value={company}
                onValueChange={(v) => {
                  setCompany(v);
                  setOffset(0);
                  const url = new URL(window.location.href);
                  url.searchParams.set("company", v);
                  window.history.replaceState({}, "", url);
                }}
              >
                <SelectTrigger
                  className="scope-select"
                  aria-label="Company scope"
                >
                  <Building2 size={17} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {data.companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="scope-note">
                {company === "all"
                  ? "Combined company view"
                  : "Company workspace"}
              </span>
              <span className="period-label">
                {from || to
                  ? `${from ? shortDate(from) : "Beginning"} – ${to ? shortDate(to) : "Today"}`
                  : "All recorded history"}
              </span>
            </div>
          )}
          {error && (
            <div className="error-panel" role="alert">
              <h2>We couldn’t load this workspace</h2>
              <p>{error}</p>
              <Button
                variant="outline"
                onClick={() => setRefresh((v) => v + 1)}
              >
                Try again
              </Button>
            </div>
          )}
          {!data && !error ? (
            <Busy />
          ) : (
            data &&
            !error && (
              <>
                {view === "overview" &&
                  (loading ? (
                    <Busy />
                  ) : (
                    <Overview
                      data={data}
                      list={list}
                      company={company}
                      onSetup={(scope) => navigate("setup", scope)}
                      onRecords={() => navigate("records")}
                      onCreate={(kind) => setForm({ kind })}
                      onUpload={() => setUpload({})}
                      onOpen={openRecord}
                    />
                  ))}
                {["records", "reviews", "explorer"].includes(view) && (
                  <>
                    <div className="filters-panel">
                      <div className="search-field">
                        <Search size={18} />
                        <Input
                          aria-label="Search records"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={
                            view === "explorer"
                              ? "Find a record, purpose, invoice, or counterparty…"
                              : "Search records…"
                          }
                        />
                      </div>
                      <div className="filter-choices">
                        <Choice
                          label="Record type"
                          value={kind}
                          onChange={(v) => {
                            setKind(v);
                            setOffset(0);
                          }}
                          options={[
                            { value: "all", label: "All record types" },
                            ...Object.entries(KIND_LABELS).map(
                              ([value, label]) => ({ value, label }),
                            ),
                          ]}
                        />
                        {view !== "reviews" && (
                          <Choice
                            label="Status"
                            value={status}
                            onChange={(v) => {
                              setStatus(v);
                              setOffset(0);
                            }}
                            options={[
                              { value: "all", label: "All current records" },
                              { value: "draft", label: "Drafts" },
                              { value: "submitted", label: "Awaiting review" },
                              { value: "approved", label: "Approved" },
                              { value: "returned", label: "Returned" },
                              {
                                value: "superseded",
                                label: "Superseded history",
                              },
                              { value: "voided", label: "Voided history" },
                            ]}
                          />
                        )}
                        <Choice
                          label="Period"
                          value={period}
                          onChange={(v) => {
                            setPeriod(v);
                            if (v !== "custom") {
                              const p = resolvedPeriod(v);
                              setFrom(p.from);
                              setTo(p.to);
                            }
                            setOffset(0);
                          }}
                          options={[
                            { value: "all", label: "All time" },
                            { value: "yesterday", label: "Yesterday" },
                            { value: "7days", label: "Last 7 completed days" },
                            { value: "month", label: "This month" },
                            {
                              value: "previous-month",
                              label: "Previous month",
                            },
                            { value: "custom", label: "Custom dates" },
                          ]}
                        />
                        {period === "custom" && (
                          <>
                            <Field
                              label="From"
                              type="date"
                              value={from}
                              onChange={(e) => {
                                setFrom(e.target.value);
                                setOffset(0);
                              }}
                            />
                            <Field
                              label="To"
                              type="date"
                              value={to}
                              onChange={(e) => {
                                setTo(e.target.value);
                                setOffset(0);
                              }}
                            />
                          </>
                        )}
                      </div>
                    </div>
                    {view === "explorer" && (
                      <div className="explorer-basis">
                        <ShieldCheck size={18} />
                        <span>
                          Latest recorded history · Business dates ·{" "}
                          {status === "approved"
                            ? "Approved records"
                            : "Selected record statuses"}
                          . Period summaries retain their original date range.
                        </span>
                      </div>
                    )}
                    <section className="panel">
                      <div className="list-heading">
                        <h2>
                          {view === "reviews"
                            ? "Awaiting review"
                            : view === "explorer"
                              ? "Matching records"
                              : "Your records"}
                          <span className="count-badge">{list.total}</span>
                        </h2>
                        <a
                          className="export-button"
                          href={`/api/export?${params}`}
                        >
                          <Download size={15} />
                          Export CSV
                        </a>
                      </div>
                      {loading ? (
                        <Busy />
                      ) : (
                        <RecordTable
                          records={list.records}
                          onOpen={openRecord}
                          onCreate={
                            canCreate && view === "records" && !query
                              ? () => setForm({ kind: "expense" })
                              : undefined
                          }
                          emptyTitle={
                            query
                              ? "No matching records"
                              : view === "reviews"
                                ? "Your review queue is clear"
                                : view === "explorer"
                                  ? "No records match this period"
                                  : "Your history starts here"
                          }
                          emptyDescription={
                            query
                              ? "Try another description, reference, or date range."
                              : view === "reviews"
                                ? "Submitted records will appear here for an authorized reviewer."
                                : "Recorded activity will appear here with its purpose, ownership, and supporting evidence."
                          }
                        />
                      )}
                      {list.total > 30 && (
                        <Pagination
                          offset={offset}
                          total={list.total}
                          size={30}
                          onChange={setOffset}
                        />
                      )}
                    </section>
                    {view === "reviews" && (
                      <Coverage company={company} refresh={refresh} />
                    )}
                  </>
                )}
                {view === "archive" && (
                  <>
                    <div className="filters-panel">
                      <div className="search-field">
                        <Search size={18} />
                        <Input
                          aria-label="Search archive"
                          placeholder="Find a document, reference, or description…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    {loading ? (
                      <Busy />
                    ) : documents.length ? (
                      <div className="documents-grid">
                        {documents.map((d) => (
                          <article className="document-card" key={d.id}>
                            <div className="document-preview">
                              <span>
                                {d.mime_type === "application/pdf"
                                  ? "PDF"
                                  : "IMAGE"}
                              </span>
                              <FileText size={38} />
                            </div>
                            <div className="document-card-content">
                              <span className="small-label">
                                {d.document_type}
                              </span>
                              <a
                                className="document-name"
                                href={`/api/documents/${d.id}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {d.name}
                                <ArrowUpRight size={15} />
                              </a>
                              <p>{scopeLabel(d, data)}</p>
                              <small>
                                {shortDate(d.document_date)} ·{" "}
                                {Math.max(1, Math.round(d.size / 1024))} KB
                              </small>
                              {d.description && (
                                <p className="document-description">
                                  {d.description}
                                </p>
                              )}
                              <div className="document-actions">
                                <a href={`/api/documents/${d.id}?download=1`}>
                                  <Download size={15} />
                                  Download
                                </a>
                                {d.record_ids && (
                                  <button
                                    onClick={() =>
                                      openRecord(d.record_ids!.split(",")[0])
                                    }
                                  >
                                    Linked record <ChevronRight size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="panel">
                        <EmptyState
                          title="A home for your supporting documents"
                          description="Keep invoices, receipts, reports, and other originals together. Search by their description or reference whenever you need them."
                          action={
                            canCreate
                              ? "Archive your first document"
                              : undefined
                          }
                          onAction={() => setUpload({})}
                        />
                      </div>
                    )}
                    {documentTotal > 50 && (
                      <Pagination
                        offset={offset}
                        total={documentTotal}
                        size={50}
                        onChange={setOffset}
                      />
                    )}
                  </>
                )}
                {view === "setup" && (
                  <Setup data={data} company={company} onChanged={changed} />
                )}
              </>
            )
          )}
          <footer className="page-footer">
            <span>I-RECORDS · ITEMBA GROUP</span>
            <span>Records. Evidence. History.</span>
          </footer>
        </main>
      </div>
      {data && selected && !form && !upload && (
        <RecordDetailPanel
          key={`${selected}-${detailKey}`}
          id={selected}
          data={data}
          onClose={closeRecord}
          onEdit={(record) => setForm({ kind: record.kind, record })}
          onUpload={(record) => setUpload({ record })}
          onChanged={changed}
          onOpen={openRecord}
        />
      )}
      {data && form && (
        <RecordForm
          data={data}
          company={company}
          kind={form.kind}
          record={form.record}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            openRecord(id);
            changed();
          }}
        />
      )}
      {data && upload && (
        <DocumentUpload
          data={data}
          company={company}
          record={upload.record}
          onClose={() => setUpload(null)}
          onSaved={() => {
            setUpload(null);
            changed();
          }}
        />
      )}
    </>
  );
}
function Pagination({
  offset,
  total,
  size,
  onChange,
}: {
  offset: number;
  total: number;
  size: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {offset + 1}–{Math.min(offset + size, total)} of {total} records
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - size))}
      >
        <ChevronLeft size={15} />
        Previous
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={offset + size >= total}
        onClick={() => onChange(offset + size)}
      >
        Next
        <ChevronRight size={15} />
      </Button>
    </div>
  );
}
