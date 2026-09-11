"use client";
import { useId } from "react";
import { FolderOpen, LoaderCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { businessToday } from "@/lib/records-domain";
import type { Scope } from "@/lib/records-domain";
import type { WorkspaceData } from "@/lib/records-types";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error || "Could not complete this action.");
  return data;
}
export function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Select",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || "__none"}
        onValueChange={(v) => onChange(v === "__none" ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {!options.some((o) => !o.value) && (
            <SelectItem value="__none" disabled>
              {placeholder}
            </SelectItem>
          )}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value || "__none"}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function Field({
  label,
  ...props
}: React.ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
export function ScopeFields({
  data,
  scope,
  onChange,
  allowGroup = false,
  disabled = false,
}: {
  data: WorkspaceData;
  scope: Scope;
  onChange: (s: Scope) => void;
  allowGroup?: boolean;
  disabled?: boolean;
}) {
  const divisions = data.divisions.filter(
      (d) => d.company_id === scope.company_id && d.active,
    ),
    branches = data.branches.filter(
      (b) => b.division_id === scope.division_id && b.active,
    );
  return (
    <div className="form-grid">
      <Choice
        label="Company"
        value={scope.company_id || ""}
        onChange={(v) =>
          onChange({
            company_id: v || null,
            division_id: null,
            branch_id: null,
          })
        }
        disabled={disabled}
        options={[
          ...(allowGroup
            ? [{ value: "", label: "ITEMBA GROUP · Group-wide" }]
            : []),
          ...data.companies.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      {divisions.length > 0 && (
        <Choice
          label="Division"
          value={scope.division_id || ""}
          onChange={(v) =>
            onChange({ ...scope, division_id: v || null, branch_id: null })
          }
          disabled={disabled}
          options={[
            { value: "", label: "Company-wide" },
            ...divisions.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
      )}
      {scope.division_id && branches.length > 0 && (
        <Choice
          label="Branch"
          value={scope.branch_id || ""}
          onChange={(v) => onChange({ ...scope, branch_id: v || null })}
          disabled={disabled}
          options={[
            { value: "", label: "Division-wide" },
            ...branches.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Empty className="product-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpen />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && (
        <Button variant="outline" onClick={onAction}>
          {action}
        </Button>
      )}
    </Empty>
  );
}
export function Busy() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="animate-spin" size={21} /> Loading your records…
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    draft: "Draft",
    submitted: "Awaiting review",
    returned: "Returned",
    approved: "Approved",
    superseded: "Superseded",
    voided: "Voided",
  };
  return (
    <span className={`status-badge ${value}`}>{labels[value] || value}</span>
  );
}
export function scopeLabel(scope: Scope, data: WorkspaceData) {
  return [
    data.companies.find((c) => c.id === scope.company_id)?.name ||
      "ITEMBA GROUP",
    data.divisions.find((d) => d.id === scope.division_id)?.name,
    data.branches.find((b) => b.id === scope.branch_id)?.name,
  ]
    .filter(Boolean)
    .join(" / ");
}
export function resolvedPeriod(value: string) {
  const today = businessToday(),
    date = new Date(`${today}T12:00:00Z`),
    fmt = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() - 1);
  if (value === "yesterday") return { from: fmt(end), to: fmt(end) };
  if (value === "7days") {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return { from: fmt(start), to: fmt(end) };
  }
  if (value === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (value === "previous-month") {
    const first = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1),
      ),
      last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0));
    return { from: fmt(first), to: fmt(last) };
  }
  return { from: "", to: "" };
}
