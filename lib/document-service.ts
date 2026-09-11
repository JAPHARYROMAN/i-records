import { AppError, dateValue, requireValue, textValue } from "./records-domain";
import type { Scope } from "./records-domain";
import type { RecordsService } from "./records-service";

export async function readArchivedDocument(
  id: string,
  s: RecordsService,
  bucket: R2Bucket | undefined,
) {
  const document = await s.getDocument(id);
  requireValue(bucket, "Document storage is unavailable.", 503);
  const file = await bucket.get(document.object_key);
  requireValue(file, "The document is temporarily unavailable.", 503);
  return { document, file };
}

export async function archiveDocument(
  request: Request,
  s: RecordsService,
  bucket: R2Bucket | undefined,
) {
  requireValue(bucket, "Document storage is temporarily unavailable.", 503);
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
  await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
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
    // D1 may have committed even when its response was lost. Reconcile the
    // complete transaction before reporting failure; never delete original bytes
    // based on an uncertain outcome or a potentially stale negative read.
    try {
      const committed = await s.one<{ id: string }>(
        "SELECT d.id FROM documents d WHERE d.id=? AND d.object_key=? AND d.sha256=? AND d.uploaded_by=? AND (?='' OR EXISTS(SELECT 1 FROM record_documents rd WHERE rd.document_id=d.id AND rd.record_id=?))",
        [id, key, hash, s.user.userId, recordId, recordId],
      );
      if (committed) return { id, name };
    } catch {
      // The database may still be unavailable. Retain the original for recovery.
    }
    // Preserve actionable conflicts for the API without deleting retained bytes.
    if (
      error instanceof Error &&
      /evidence_scope_mismatch|UNIQUE constraint/.test(error.message)
    )
      throw error;
    console.error("Document archival outcome unconfirmed; original retained", {
      documentId: id,
    });
    throw new AppError(
      "We could not confirm the upload. Check the document archive before trying again.",
      503,
    );
  }
  return { id, name };
}
