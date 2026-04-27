/* Vercel Edge Function — Resume original-file storage
 *
 * Accepts a base64-encoded resume file, uploads to the Supabase Storage
 * bucket `resume-files`, and writes the resulting path back to the
 * matching resume_versions row's file_path column.
 *
 * Why base64 over multipart: Edge runtime's multipart support is
 * spotty across Node versions, and our apiClient sends JSON via XHR
 * to bypass extension-wrapped fetch (see ab41317). Base64-in-JSON
 * keeps the same transport and works in both runtimes. ~33% size
 * overhead is acceptable — resumes are sub-1MB typically.
 *
 * Defensive design: if the bucket doesn't exist, the storage upload
 * returns a 4xx and we degrade gracefully — the resume_versions row
 * stays valid (file_path NULL) and the client gets a 503 telling it
 * file storage isn't configured. The rest of the resume flow keeps
 * working unchanged.
 */

export const config = { runtime: "edge" };

import { withAuthAndRateLimit, corsHeaders, withRequestId } from "./_shared";

declare const process: { env: Record<string, string | undefined> };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "resume-files";

/** Decode a base64 string into bytes. Edge-safe — atob exists on globalThis. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Map a sniffed MIME type to a file extension we'll use in Storage. */
function inferExtension(contentType: string, fileName: string): string {
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("wordprocessingml") || contentType.includes("docx")) return "docx";
  if (contentType.includes("text/plain")) return "txt";
  // Fallback: last segment of the file name
  const m = fileName.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "bin";
}

interface UploadBody {
  resumeVersionId?: unknown;
  fileName?: unknown;
  contentType?: unknown;
  fileBase64?: unknown;
}

export default async function handler(req: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: withRequestId(corsHeaders(req)),
    });
  }

  // 12 MB ceiling on the JSON body (covers ~9 MB raw file at base64
  // overhead). PDF resumes are nearly always under 1 MB; this leaves
  // generous headroom without enabling multi-MB DOCX abuse.
  const pre = await withAuthAndRateLimit(req, {
    endpoint: "resume-upload-file",
    ipLimit: 30,
    userLimit: 15,
    maxBytes: 12_000_000,
    checkQuota: false,
  });
  if (pre instanceof Response) return pre;
  const { headers, auth } = pre;

  if (!auth.userId || typeof auth.userId !== "string") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  let body: UploadBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const versionId = typeof body.resumeVersionId === "string" && /^[0-9a-f-]{32,}$/i.test(body.resumeVersionId)
    ? body.resumeVersionId
    : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 255) : "resume";
  const contentType = typeof body.contentType === "string" ? body.contentType.slice(0, 100) : "application/octet-stream";
  const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";

  if (!versionId) return new Response(JSON.stringify({ error: "Missing resumeVersionId" }), { status: 400, headers });
  if (!fileBase64) return new Response(JSON.stringify({ error: "Missing fileBase64" }), { status: 400, headers });

  // 1. Verify the version belongs to this user (defence-in-depth — RLS
  //    would catch it but the resumes inner-join is on service-role-
  //    bypass anyway, so we check explicitly).
  let resumeId = "";
  try {
    const verRes = await fetch(
      `${SUPABASE_URL}/rest/v1/resume_versions?id=eq.${encodeURIComponent(versionId)}&select=id,resume_id,resumes!inner(user_id)&resumes.user_id=eq.${encodeURIComponent(auth.userId)}&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } },
    );
    if (!verRes.ok) {
      return new Response(JSON.stringify({ error: "Version lookup failed" }), { status: 502, headers });
    }
    const rows = await verRes.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "Resume version not found" }), { status: 404, headers });
    }
    resumeId = rows[0].resume_id;
  } catch {
    return new Response(JSON.stringify({ error: "Version lookup error" }), { status: 502, headers });
  }

  // 2. Decode + upload to Storage. Path layout matches the bucket RLS
  //    policy in the runbook: {user_id}/{resume_id}/{version_id}.{ext}
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(fileBase64);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid base64 file content" }), { status: 400, headers });
  }
  if (bytes.length === 0) {
    return new Response(JSON.stringify({ error: "Empty file" }), { status: 400, headers });
  }
  if (bytes.length > 10_000_000) {
    return new Response(JSON.stringify({ error: "File too large (10MB max)" }), { status: 413, headers });
  }

  const ext = inferExtension(contentType, fileName);
  const storagePath = `${auth.userId}/${resumeId}/${versionId}.${ext}`;

  try {
    // Supabase Storage REST: POST /storage/v1/object/{bucket}/{path}
    // Use upsert=true so re-uploading the exact same version overwrites
    // (idempotent). x-upsert header is the documented way.
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": contentType,
          "x-upsert": "true",
          "Cache-Control": "max-age=31536000, immutable", // versioned path; never invalidates
        },
        // Wrap as ArrayBuffer slice — the BodyInit overloads accept
        // ArrayBuffer / Blob / string but not Uint8Array directly under
        // strict DOM lib settings, even though runtimes handle it fine.
        body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      },
    );
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      // 404 from this endpoint = bucket doesn't exist. Don't fail the
      // resume flow over it — the user can still use the product, they
      // just won't have an original file to re-download.
      const isMissingBucket = uploadRes.status === 404 || /bucket.*not.*found/i.test(errText);
      console.warn(`[resume-upload-file] Storage upload failed (${uploadRes.status}): ${errText.slice(0, 200)}`);
      return new Response(JSON.stringify({
        error: isMissingBucket
          ? "File storage not configured (bucket missing). Resume analysis works; original file isn't archived."
          : `Upload failed: ${errText.slice(0, 100)}`,
        bucketMissing: isMissingBucket,
      }), { status: isMissingBucket ? 503 : 502, headers });
    }
  } catch (err) {
    console.error(`[resume-upload-file] Upload threw: ${(err as Error).message}`);
    return new Response(JSON.stringify({ error: "Upload error" }), { status: 502, headers });
  }

  // 3. Persist the storage path on resume_versions. Best-effort.
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/resume_versions?id=eq.${encodeURIComponent(versionId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ file_path: storagePath }),
      },
    );
  } catch (err) {
    console.warn(`[resume-upload-file] file_path patch failed: ${(err as Error).message}`);
    // Storage upload succeeded but DB patch failed — orphaned file.
    // Background reconciliation (or a periodic cleanup cron) can pick
    // it up. Don't fail the request.
  }

  return new Response(JSON.stringify({ ok: true, file_path: storagePath, size: bytes.length }), { status: 200, headers });
}
