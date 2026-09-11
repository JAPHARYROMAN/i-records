import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { RecordsService } from "@/lib/records-service";
import {
  AppError,
  dateValue,
  requireValue,
  textValue,
} from "@/lib/records-domain";
import type { Scope } from "@/lib/records-domain";

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
        const d = await s.getDocument(path[1]);
        requireValue(env.BUCKET, "Document storage is unavailable.", 503);
        const file = await env.BUCKET.get(d.object_key);
        requireValue(file, "The document is temporarily unavailable.", 503);
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
        return json(await upload(request, s), 201);
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

async function upload(request: Request, s: RecordsService) {
  requireValue(env.BUCKET, "Document storage is temporarily unavailable.", 503);
  requireValue(
    Number(request.headers.get("content-length")) <= 22 * 1024 * 1024,
    "Choose a file smaller than 20 MB.",
    413,
  );
  const form = await request.formData(),
    file = form.get("file");
  requireValue(file instanceof File, "Choose a document to upload.");
  requireValue(
    file.size > 0 && file.size <= 20 * 1024 * 1024,
    "Choose a file between 1 byte and 20 MB.",
  );
  const scope: Scope = {
    company_id: String(form.get("company_id") || "") || null,
    division_id: String(form.get("division_id") || "") || null,
    branch_id: String(form.get("branch_id") || "") || null,
  };
  s.access(scope, "record");
  if (scope.company_id) await s.validateScope(scope);
  else
    requireValue(
      !scope.division_id && !scope.branch_id,
      "Choose a company for this document scope.",
    );
  const recordId = String(form.get("record_id") || "");
  if (recordId) {
    const r = await s.getRecord(recordId, "record");
    requireValue(
      r.company_id === scope.company_id &&
        r.division_id === scope.division_id &&
        r.branch_id === scope.branch_id,
      "Use the record’s owning unit for its evidence.",
    );
    requireValue(
      !["superseded", "voided"].includes(r.status),
      "Attach documents to the effective record.",
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer()),
    header = Array.from(bytes.slice(0, 8)),
    name = file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200);
  let mime = "";
  if (
    header
      .slice(0, 5)
      .map((x) => String.fromCharCode(x))
      .join("") === "%PDF-" &&
    /\.pdf$/i.test(name)
  )
    mime = "application/pdf";
  if (
    header.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10" &&
    /\.png$/i.test(name)
  )
    mime = "image/png";
  if (
    header[0] === 255 &&
    header[1] === 216 &&
    header[2] === 255 &&
    /\.jpe?g$/i.test(name)
  )
    mime = "image/jpeg";
  requireValue(mime, "Upload a valid PDF, PNG, or JPG document.");
  const documentType = textValue(
      form.get("document_type") || "Supporting document",
      "Document type",
      80,
    ),
    date = dateValue(form.get("document_date"), "Document date");
  const reference = textValue(form.get("reference"), "Reference", 150, false),
    description = textValue(
      form.get("description"),
      "Description",
      1500,
      false,
    ),
    physical = textValue(
      form.get("physical_location"),
      "Physical location",
      300,
      false,
    );
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const id = crypto.randomUUID(),
    key = `originals/${scope.company_id || "group"}/${id}`,
    now = new Date().toISOString();
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
  try {
    const statements = [
      s.stmt(
        "INSERT INTO documents(id,company_id,division_id,branch_id,name,document_type,document_date,reference,description,physical_location,object_key,mime_type,size,sha256,uploaded_by,uploaded_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          scope.company_id,
          scope.division_id,
          scope.branch_id,
          name,
          documentType,
          date,
          reference,
          description,
          physical,
          key,
          mime,
          file.size,
          hash,
          s.user.userId,
          s.user.displayName,
          now,
        ],
      ),
      s.auditStatement("Document archived", scope, name, recordId || null, {
        document_id: id,
        sha256: hash,
      }),
    ];
    if (recordId)
      statements.push(
        s.stmt(
          "INSERT INTO record_documents(id,record_id,document_id,created_at) VALUES(?,?,?,?)",
          [crypto.randomUUID(), recordId, id, now],
        ),
      );
    await s.db.batch(statements);
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }
  return { id, name };
}
export const GET = handle;
export const POST = handle;
