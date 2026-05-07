/**
 * Sanitize a value for safe CSV output.
 * Prevents CSV injection (formula injection) by prefixing dangerous characters.
 * Properly quotes values containing commas, quotes, or newlines.
 */
export function sanitizeCsvValue(val: unknown): string {
  const s = String(val ?? '');
  const dangerous = /^[=+\-@\t\r]/;

  // Quote if contains special characters
  let escaped = s;
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    escaped = `"${s.replace(/"/g, '""')}"`;
  }

  // Prefix with single quote if starts with dangerous character
  if (dangerous.test(escaped)) {
    escaped = `'${escaped}`;
  }

  return escaped;
}

/**
 * Convert an array of values to a sanitized CSV row string.
 */
export function toCsvRow(values: unknown[]): string {
  return values.map(sanitizeCsvValue).join(',');
}

/**
 * Build a complete CSV string from headers and rows.
 */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [toCsvRow(headers), ...rows.map(r => toCsvRow(r))].join('\n');
}

/**
 * Trigger a CSV download in the browser with proper cleanup.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Cleanup to prevent memory leak
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
