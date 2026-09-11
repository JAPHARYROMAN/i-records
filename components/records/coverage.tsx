"use client";
import { useEffect, useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { api, EmptyState } from "./shared";
import { shortDate } from "@/lib/records-domain";
export function Coverage({
  company,
  refresh,
}: {
  company: string;
  refresh: number;
}) {
  const [items, setItems] = useState<
      {
        id: string;
        scope: string;
        from: string;
        to: string;
        status: string;
        kind: string;
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ items: typeof items }>(`coverage?company=${company}`)
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [company, refresh]);
  return (
    <section className="panel coverage-panel">
      <div className="list-heading">
        <h2>
          <CalendarCheck2 size={19} />
          Latest expected submissions
        </h2>
        <span className="field-hint">Completed periods only</span>
      </div>
      {error ? (
        <p className="form-error">{error}</p>
      ) : !items.length ? (
        <EmptyState
          title="Reporting is not configured"
          description="Set expectations during organization setup. Until then, missing records are not treated as zero activity."
        />
      ) : (
        <div className="coverage-list">
          {items.map((item) => (
            <div className="coverage-row" key={item.id}>
              <div>
                <strong>{item.scope}</strong>
                <small>
                  {item.kind} · {shortDate(item.from)}
                  {item.from !== item.to ? ` – ${shortDate(item.to)}` : ""}
                </small>
              </div>
              <span
                className={`status-badge ${item.status === "Approved" || item.status === "Confirmed no activity" ? "approved" : item.status === "Not submitted" ? "returned" : "draft"}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
