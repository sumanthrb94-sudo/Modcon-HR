/**
 * Where the handbook PDF's *bytes* live.
 *
 * This is a deliberate seam. Everything else in the module — the metadata
 * model, the Firestore rules, the permission wiring, the UI — is independent of
 * how the binary is transported, so the transport is isolated here behind
 * `encodeUpload` / `toBlobUrl` and can be replaced without touching them.
 *
 * The implementation below stores the PDF base64-encoded inside the version
 * document. That is not the production answer; it is the only answer available
 * to this project today, and the reason is worth recording:
 *
 *   Firebase Cloud Storage is not provisioned here — no `firebase/storage`
 *   import anywhere in src/, no `storage` block in firebase.json, no
 *   storage.rules. And it could not be gated correctly even if it were:
 *   **Cloud Storage security rules cannot read Firestore.** There is no
 *   `firestore.get()` available to them, so a Storage rule cannot consult
 *   `users/{uid}.role` — the mechanism every other authorization check in this
 *   app depends on. Role would have to reach Storage as a custom claim (needs a
 *   Cloud Function to mint it, plus the Blaze plan) or the upload would have to
 *   run server-side in a callable Function (same dependency).
 *
 * So the bytes go in Firestore, where the existing `isOrgAdmin()` rule works.
 * The cost is Firestore's hard 1 MiB per-document ceiling: base64 inflates by
 * ~4/3, and the metadata fields need room, so the usable PDF ceiling is
 * `HANDBOOK_MAX_BYTES` below — well under what a real handbook will be.
 *
 * To move to Cloud Storage later: implement `encodeUpload` to upload the object
 * and return `{ storagePath }` instead of `{ contentBase64 }`, implement
 * `toBlobUrl` to fetch a download URL, widen the size ceiling, and swap the
 * `contentBase64` field for `storagePath` in the type and in the
 * `handbook_versions` create rule. Nothing else in the module changes.
 */

/**
 * Largest PDF accepted, in bytes.
 *
 * Firestore's limit is 1 MiB (1,048,576) for the entire document. Base64 costs
 * 4 bytes per 3, and `notes`/`fileName`/uids/timestamps need headroom, so this
 * leaves ~64 KB of slack: 720 KB * 4/3 ≈ 983 KB encoded.
 */
export const HANDBOOK_MAX_BYTES = 720 * 1024;

export const HANDBOOK_CONTENT_TYPE = 'application/pdf';

export interface EncodedUpload {
  contentBase64: string;
  sizeBytes: number;
}

/** Human-readable size, for the UI and for the over-limit error message. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class HandbookUploadError extends Error {}

/**
 * Validate and encode a chosen file for upload.
 *
 * The checks here are UX, not enforcement — the same content type and size
 * limits are asserted server-side in `firestore.rules`, because a hostile
 * client simply would not run this function.
 */
export async function encodeUpload(file: File): Promise<EncodedUpload> {
  if (file.type !== HANDBOOK_CONTENT_TYPE) {
    throw new HandbookUploadError('The handbook must be a PDF file.');
  }
  if (file.size === 0) {
    throw new HandbookUploadError('That file is empty.');
  }
  if (file.size > HANDBOOK_MAX_BYTES) {
    throw new HandbookUploadError(
      `That PDF is ${formatBytes(file.size)}. The current limit is ${formatBytes(
        HANDBOOK_MAX_BYTES,
      )} — see the note in src/lib/handbookStorage.ts on raising it.`,
    );
  }

  const contentBase64 = await readAsBase64(file);
  return { contentBase64, sizeBytes: file.size };
}

/**
 * Read a File as bare base64 (no `data:` prefix).
 *
 * FileReader rather than `btoa(String.fromCharCode(...bytes))`: spreading a
 * 700 KB byte array into an argument list overflows the call stack.
 *
 * Exported because payslip uploads store their PDF the same way and for the
 * same reason (src/lib/payslipDocuments.ts). The seam described in this file's
 * header is now shared by two features, so replacing it replaces both.
 */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new HandbookUploadError('Could not read that file.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * An object URL for viewing or downloading a stored version.
 *
 * A Blob URL rather than a `data:` URL so the browser's PDF viewer and the
 * download attribute both behave, and so the caller can revoke it — callers
 * must call `URL.revokeObjectURL` when the view unmounts or the memory is held
 * for the life of the tab.
 */
export function toBlobUrl(contentBase64: string): string {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: HANDBOOK_CONTENT_TYPE }));
}
