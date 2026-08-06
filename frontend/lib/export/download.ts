/** Triggers a browser "Save As" download for an in-memory blob — no server round trip. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Deferred so Safari/Firefox have a tick to actually start the download
  // before the object URL backing it is revoked.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), filename);
}
