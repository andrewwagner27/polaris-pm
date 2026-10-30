/**
 * storageUtils.js — signed URL helpers for SEC-001
 *
 * All four buckets (lease-documents, screening-reports,
 * inspection-photos, maintenance-photos) will be set to PRIVATE.
 * Callers must use getSignedStorageUrl() to produce short-lived
 * authenticated URLs rather than storing or serving public URLs.
 *
 * Path derivation: legacy rows stored the full Supabase public URL.
 * extractStoragePath() strips the public-URL prefix back to the
 * object path so we can generate a signed URL for old rows without
 * a migration.
 */

import { supabase } from "./supabase";

const SIGNED_URL_TTL = 600; // 10 minutes

/**
 * Derive the storage object path from either:
 *   - A bare path already (no "http"): returned as-is.
 *   - A legacy full Supabase public URL:
 *       https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *     → <path>
 *
 * @param {string} urlOrPath  Value stored in DB (may be full URL or bare path)
 * @param {string} bucket     The bucket name (used to locate the path segment)
 * @returns {string|null}     Bare object path, or null if not parseable
 */
export function extractStoragePath(urlOrPath, bucket) {
  if (!urlOrPath) return null;
  if (!urlOrPath.startsWith("http")) return urlOrPath; // already a path
  try {
    const marker = `/object/public/${bucket}/`;
    const idx = urlOrPath.indexOf(marker);
    if (idx !== -1) return urlOrPath.slice(idx + marker.length);
    // Fallback: try signed-URL shape
    const markerS = `/object/sign/${bucket}/`;
    const idxS = urlOrPath.indexOf(markerS);
    if (idxS !== -1) return urlOrPath.slice(idxS + markerS.length).split("?")[0];
  } catch (_) {}
  return null;
}

/**
 * Generate a short-lived signed URL for a stored document.
 *
 * @param {string} bucket     Storage bucket name
 * @param {string} urlOrPath  DB value (full legacy URL or bare path)
 * @param {number} [expiresIn=600]  TTL in seconds
 * @returns {Promise<string|null>}  Signed URL, or null on error/missing input
 */
export async function getSignedStorageUrl(bucket, urlOrPath, expiresIn = SIGNED_URL_TTL) {
  const path = extractStoragePath(urlOrPath, bucket);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
