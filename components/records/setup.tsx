"use client";
import { useState } from "react";
import {
  Building2,
  ChevronRight,
  GitBranch,
  LockKeyhole,
  Plus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  businessToday,
  permitted,
  PROFILES,
  shortDate,
} from "@/lib/records-domain";
import type { Scope } from "@/lib/records-domain";
import type { WorkspaceData } from "@/lib/records-types";
import {
  api,
  Choice,
  EmptyState,
  Field,
  ScopeFields,
  scopeLabel,
} from "./shared";

export function Setup({
  data,
  company,
  onChanged,
}: {
  data: WorkspaceData;
  company: string;
  onChanged: () => void;
}) {
  const [modal, setModal] = useState("");
  const [scope, setScope] = useState<Scope>({
    company_id: company === "all" ? data.companies[0]?.id : company,
    division_id: null,
    branch_id: null,
  });
  const [form, setForm] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const isAdmin = data.memberships.some((m) => m.role === "admin");
  const shown = data.companies.filter(
      (c) => company === "all" || c.id === company,
    ),
    titles: Record<string, string> = {
      division: "Add a division",
      branch: "Add a branch",
      member: "Assign access",
      expectation: "Set reporting expectations",
      period: "Manage reporting period",
    };
  function open(type: string, newScope?: Scope) {
    setModal(type);
    setScope(
      newScope || {
        company_id: company === "all" ? data.companies[0]?.id : company,
        division_id: null,
        branch_id: null,
      },
    );
    setForm({
      profile: "general",
      role: "recorder",
      frequency: "daily",
      kind: "sale",
      start_date: businessToday(),
    });
    setError("");
  }
  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("setup", { entity: modal, ...scope, ...form });
      toast.success(
        modal === "member" ? "Access assignment saved" : "Organization updated",
      );
      setModal("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(
    target: string,
    id: string,
    active: boolean,
    company_id: string | null,
  ) {
    try {
      await api("setup", { entity: "status", target, id, active, company_id });
      toast.success(active ? "Activated" : "Deactivated; history preserved");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <>
      <Tabs defaultValue="organization" className="setup-tabs">
        <TabsList>
          <TabsTrigger value="organization">
            <Building2 size={16} />
            Organization
          </TabsTrigger>
          <TabsTrigger value="people">
            <Users size={16} />
            People & access
          </TabsTrigger>
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
        </TabsList>
        <TabsContent value="organization">
          <div className="setup-intro">
            <h2>A place for every record</h2>
            <p>
              Group → Company → Division → Branch. Add the structure as your
              team gets ready.
            </p>
          </div>
          {shown.map((c) => (
            <section className="organization-company" key={c.id}>
              <div className="organization-company-header">
                <span
                  className={`company-monogram ${c.id === "itemba" ? "enterprise" : c.id === "westsides" ? "west" : "oil"}`}
                >
                  {c.code}
                </span>
                <div>
                  <h2>{c.name}</h2>
                  <p>{c.description}</p>
                </div>
                {permitted(data.memberships, { company_id: c.id }, "admin") && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      open("division", {
                        company_id: c.id,
                        division_id: null,
                        branch_id: null,
                      })
                    }
                  >
                    <Plus size={15} />
                    Add division
                  </Button>
                )}
              </div>
              {!data.divisions.some((d) => d.company_id === c.id) ? (
                <div className="setup-company-empty">
                  <GitBranch size={21} />
                  <div>
                    <h3>No divisions yet</h3>
                    <p>
                      You can record company-wide activity while you set up.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="division-list">
                  {data.divisions
                    .filter((d) => d.company_id === c.id)
                    .map((d) => (
                      <div
                        className={`division-item ${!d.active ? "inactive-item" : ""}`}
                        key={d.id}
                      >
                        <div className="division-header">
                          <GitBranch size={18} />
                          <div>
                            <h3>
                              {d.name}
                              {!d.active && (
                                <span className="setup-badge">Inactive</span>
                              )}
                            </h3>
                            <p>
                              {PROFILES[d.profile]} · {d.code}
                            </p>
                          </div>
                          {permitted(
                            data.memberships,
                            { company_id: c.id, division_id: d.id },
                            "admin",
                          ) && (
                            <div className="inline-actions">
                              {d.active === 1 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    open("branch", {
                                      company_id: c.id,
                                      division_id: d.id,
                                      branch_id: null,
                                    })
                                  }
                                >
                                  <Plus size={14} />
                                  Branch
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  toggle("division", d.id, !d.active, c.id)
                                }
                              >
                                {d.active ? "Deactivate" : "Activate"}
                              </Button>
                            </div>
                          )}
                        </div>
                        {data.branches
                          .filter((b) => b.division_id === d.id)
                          .map((b) => (
                            <div className="branch-row" key={b.id}>
                              <ChevronRight size={15} />
                              <span>{b.name}</span>
                              <small>
                                {b.code}
                                {b.location ? ` · ${b.location}` : ""}
                              </small>
                              <span className="setup-badge">
                                {b.active ? "Active" : "Inactive"}
                              </span>
                              {permitted(
                                data.memberships,
                                {
                                  company_id: c.id,
                                  division_id: d.id,
                                  branch_id: b.id,
                                },
                                "admin",
                              ) && (
                                <button
                                  className="text-action"
                                  onClick={() =>
                                    toggle("branch", b.id, !b.active, c.id)
                                  }
                                >
                                  {b.active ? "Deactivate" : "Activate"}
                                </button>
                              )}
                            </div>
                          ))}
                      </div>
                    ))}
                </div>
              )}
            </section>
          ))}
        </TabsContent>
        <TabsContent value="people">
          <div className="section-heading setup-section-heading">
            <div>
              <h2>People & access</h2>
              <p className="section-subtitle">
                Give each person a role and a place to work.
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => open("member")}>
                <Plus size={16} />
                Assign access
              </Button>
            )}
          </div>
          <div className="panel">
            {data.members.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <strong>{m.name}</strong>
                        <small className="cell-subtitle">{m.email}</small>
                      </TableCell>
                      <TableCell>
                        <span className="role-label">
                          {m.role === "admin" ? "Administrator" : m.role}
                        </span>
                      </TableCell>
                      <TableCell>{scopeLabel(m, data)}</TableCell>
                      <TableCell>
                        {m.active
                          ? m.user_id
                            ? "Active"
                            : "Awaiting first sign-in"
                          : "Inactive"}
                      </TableCell>
                      <TableCell>
                        {m.user_id !== data.user?.userId && (
                          <button
                            className="text-action"
                            onClick={() =>
                              toggle("member", m.id, !m.active, m.company_id)
                            }
                          >
                            {m.active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="Access is managed by your administrator"
                description="Your own permissions apply across every record, document, and report."
              />
            )}
          </div>
          <div className="roles-explanation">
            {[
              {
                name: "Administrator",
                text: "Configure the organization and access. Create records.",
              },
              {
                name: "Records officer",
                text: "Prepare, save, and submit records in an assigned scope.",
              },
              {
                name: "Reviewer",
                text: "Review and approve records prepared by other people.",
              },
              {
                name: "Viewer",
                text: "Find records, inspect evidence, and export reports.",
              },
            ].map((r) => (
              <div key={r.name}>
                <h3>{r.name}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
          <p className="info-note">
            Access is matched to the person’s signed-in email. Assigning access
            does not send an invitation. Private preview access is managed
            separately.
          </p>
        </TabsContent>
        <TabsContent value="reporting">
          <div className="section-heading setup-section-heading">
            <div>
              <h2>Expected submissions</h2>
              <p className="section-subtitle">
                Only configured reporting obligations can be marked as missing.
              </p>
            </div>
            {isAdmin && (
              <Button onClick={() => open("expectation")}>
                <Plus size={16} />
                Add expectation
              </Button>
            )}
          </div>
          <div className="panel">
            {data.expectations.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operating unit</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expectations
                    .filter(
                      (e) => company === "all" || e.company_id === company,
                    )
                    .map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{scopeLabel(e, data)}</TableCell>
                        <TableCell>
                          {e.kind === "sale" ? "Sales" : e.kind}
                        </TableCell>
                        <TableCell>{e.frequency}</TableCell>
                        <TableCell>{shortDate(e.start_date)}</TableCell>
                        <TableCell>
                          {isAdmin && (
                            <button
                              className="text-action"
                              disabled={!e.active}
                              onClick={() =>
                                toggle("expectation", e.id, false, e.company_id)
                              }
                            >
                              {e.active ? "Stop reporting" : "Stopped"}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="Reporting is not configured yet"
                description="Add expectations when your operating units are ready. Empty periods are never assumed to have zero activity."
              />
            )}
          </div>
          <div className="section-heading setup-section-heading">
            <div>
              <h2>Period controls</h2>
              <p className="section-subtitle">
                Close reviewed periods to protect accepted history.
              </p>
            </div>
          </div>
          <div className="period-grid">
            {shown.map((c) => (
              <article className="panel period-card" key={c.id}>
                <LockKeyhole size={19} />
                <h3>{c.name}</h3>
                <p>
                  {c.closed_through
                    ? `Closed through ${shortDate(c.closed_through)}`
                    : "All periods open"}
                </p>
                {permitted(data.memberships, { company_id: c.id }, "admin") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      open("period", {
                        company_id: c.id,
                        division_id: null,
                        branch_id: null,
                      })
                    }
                  >
                    Manage period
                  </Button>
                )}
              </article>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v && !busy) setModal("");
        }}
      >
        <DialogContent className="setup-modal">
          <DialogHeader>
            <DialogTitle>{titles[modal]}</DialogTitle>
            <DialogDescription>
              {modal === "member"
                ? "Choose what this person can do and where they can do it."
                : "Keep your organization clear and easy to navigate."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save}>
            <fieldset disabled={busy} className="entry-fields">
              <ScopeFields
                data={data}
                scope={scope}
                onChange={setScope}
                allowGroup={
                  modal === "member" &&
                  data.memberships.some(
                    (m) => m.role === "admin" && !m.company_id,
                  )
                }
              />
              {["division", "branch"].includes(modal) && (
                <>
                  <Field
                    label="Name"
                    value={form.name || ""}
                    onChange={(e) => set("name", e.target.value)}
                    required
                  />
                  <Field
                    label="Code"
                    value={form.code || ""}
                    onChange={(e) => set("code", e.target.value)}
                    placeholder="e.g. LOG or BR-01"
                    required
                  />
                  {modal === "division" ? (
                    <Choice
                      label="Business profile"
                      value={form.profile}
                      onChange={(v) => set("profile", v)}
                      options={Object.entries(PROFILES).map(
                        ([value, label]) => ({ value, label }),
                      )}
                    />
                  ) : (
                    <Field
                      label="Physical location (optional)"
                      value={form.location || ""}
                      onChange={(e) => set("location", e.target.value)}
                    />
                  )}
                </>
              )}
              {modal === "member" && (
                <>
                  <Field
                    label="Full name"
                    value={form.name || ""}
                    onChange={(e) => set("name", e.target.value)}
                    required
                  />
                  <Field
                    label="Sign-in email"
                    type="email"
                    value={form.email || ""}
                    onChange={(e) => set("email", e.target.value)}
                    required
                  />
                  <Choice
                    label="Role"
                    value={form.role}
                    onChange={(v) => set("role", v)}
                    options={[
                      { value: "admin", label: "Administrator" },
                      { value: "recorder", label: "Records officer" },
                      { value: "reviewer", label: "Reviewer" },
                      { value: "viewer", label: "Viewer / auditor" },
                    ]}
                  />
                </>
              )}
              {modal === "expectation" && (
                <>
                  <Choice
                    label="Record type"
                    value={form.kind}
                    onChange={(v) => set("kind", v)}
                    options={[
                      { value: "sale", label: "Daily sales" },
                      { value: "purchase", label: "Purchases" },
                      { value: "expense", label: "Expenses" },
                    ]}
                  />
                  <Choice
                    label="Frequency"
                    value={form.frequency}
                    onChange={(v) => set("frequency", v)}
                    options={[
                      { value: "daily", label: "Daily" },
                      { value: "weekly", label: "Weekly · Monday–Sunday" },
                      { value: "monthly", label: "Calendar month" },
                    ]}
                  />
                  <Field
                    label="Reporting starts"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => set("start_date", e.target.value)}
                    required
                  />
                </>
              )}
              {modal === "period" && (
                <>
                  <Field
                    label="Close through (leave blank to reopen)"
                    type="date"
                    value={form.closed_through || ""}
                    onChange={(e) => set("closed_through", e.target.value)}
                  />
                  <Field
                    label="Reason"
                    value={form.reason || ""}
                    onChange={(e) => set("reason", e.target.value)}
                    required
                  />
                </>
              )}
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
                onClick={() => setModal("")}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
