import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { RecordsService } from "@/lib/records-service";
import { AppError, requireValue, textValue } from "@/lib/records-domain";
import { archiveDocument, readArchivedDocument } from "@/lib/document-service";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function service() {
  const user = await getChatGPTUser();
  requireValue(user, "Sign in to access I-RECORDS.", 401);
  requireValue(env.DB, "Records storage is temporarily unavailable.", 503);
  const s = new RecordsService(env.DB, user);
  await s.loadAccess();
  return s;
}
async function handle(request: Request) {
  try {
    const url = new URL(request.url),
      path = url.pathname.replace(/^\/api\//, "").split("/");
    const s = await service();
    if (request.method === "GET") {
      if (path[0] === "workspace") return json(await s.workspace());
      if (path[0] === "coverage")
        return json(await s.coverage(url.searchParams.get("company")));
      if (path[0] === "records" && !path[1])
        return json(await s.listRecords(url.searchParams));
      if (path[0] === "records" && path[1])
        return json(await s.detail(path[1]));
      if (path[0] === "documents" && !path[1])
        return json(await s.listDocuments(url.searchParams));
      if (path[0] === "documents" && path[1]) {
        const { document: d, file } = await readArchivedDocument(
          path[1], s, env.BUCKET,
        );
        const disposition =
          url.searchParams.get("download") === "1" ? "attachment" : "inline";
        return new Response(file.body, {
          headers: {
            "Content-Type": d.mime_type,
            "Content-Length": String(d.size),
            "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(d.name)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
          },
        });
      }
      if (path[0] === "export")
        return new Response(
          "\ufeff" + (await s.exportRecords(url.searchParams)),
          {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition":
                'attachment; filename="i-records-export.csv"',
              "Cache-Control": "no-store",
            },
          },
        );
    }
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      requireValue(
        origin === url.origin,
        "This action must come from your I-RECORDS workspace.",
        403,
      );
      if (path[0] === "documents" && !path[1])
        return json(await archiveDocument(request, s, env.BUCKET), 201);
      requireValue(
        request.headers.get("content-type")?.includes("application/json"),
        "Send a JSON request.",
        415,
      );
      const bodyText = await request.text();
      requireValue(
        bodyText.length <= 100000,
        "This request is too large.",
        413,
      );
      const input = JSON.parse(bodyText);
      requireValue(
        input && typeof input === "object" && !Array.isArray(input),
        "Invalid request.",
      );
      if (path[0] === "initialize") return json(await s.initialize(), 201);
      if (path[0] === "setup") return json(await s.setup(input), 201);
      if (path[0] === "records" && !path[1])
        return json(await s.saveRecord(input), 201);
      if (path[0] === "records" && path[1] && path[2] === "action")
        return json(await s.transition(path[1], input));
      if (path[0] === "records" && path[1] && path[2] === "evidence")
        return json(
          await s.linkDocument(
            path[1],
            textValue(input.document_id, "Document", 100),
          ),
        );
    }
    return json({ error: "This page could not be found." }, 404);
  } catch (error) {
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError)
      return json({ error: "The request could not be read." }, 400);
    const message = error instanceof Error ? error.message : String(error);
    console.error("I-RECORDS request failed", message);
    if (/UNIQUE constraint/.test(message))
      return json(
        { error: "This item already exists. Refresh to see the saved entry." },
        409,
      );
    const integrityErrors: Record<string, string> = {
      record_period_closed:
        "This period was closed while you were working. Ask your administrator to reopen it.",
      overlapping_sales_period:
        "An approved sales posting already covers this unit, currency, and period. Use a correction instead of adding the same sales again.",
      correction_original_changed:
        "The original record changed. Reload it before continuing.",
      evidence_scope_locked:
        "A record with evidence must retain its owning unit.",
      evidence_scope_mismatch:
        "The document and record must belong to the same operating unit. Reload and try again.",
      approved_facts_immutable:
        "Approved history cannot be edited. Start a correction instead.",
    };
    for (const [key, explanation] of Object.entries(integrityErrors))
      if (message.includes(key)) return json({ error: explanation }, 409);
    return json(
      {
        error:
          "We could not complete that action. Your input is still here; please try again.",
      },
      503,
    );
  }
}

export const GET = handle;
export const POST = handle;
