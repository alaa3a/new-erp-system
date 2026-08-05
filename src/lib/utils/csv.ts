/**
 * CSV parsing and serialization utilities.
 *
 * parseCSV: converts a CSV string into an array of record objects (one per row).
 * toCSV: converts an array of record objects into a CSV string.
 *
 * Both handle RFC 4180 quoting rules (escaped double-quotes, embedded commas/newlines).
 */

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function unescapeCsvValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1);
    return inner.replace(/""/g, '"');
  }
  return trimmed;
}

/**
 * Parse a CSV string into an array of records.
 * The first row is treated as headers.
 * Supports quoted fields containing commas, newlines, and escaped double-quotes.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        current.push(field);
        field = '';
      } else if (char === '\r') {
        // skip — handles CRLF
      } else if (char === '\n') {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      } else {
        field += char;
      }
    }
  }
  // flush last field/row if any
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  // Remove trailing empty rows
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(unescapeCsvValue);
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === '') continue; // skip blank lines
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = unescapeCsvValue(row[c] ?? '');
    }
    result.push(record);
  }

  return result;
}

/**
 * Serialize an array of records to a CSV string.
 * Headers are derived from the keys of the first record.
 */
export function toCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const lines: string[] = [headers.map(escapeCsvValue).join(',')];

  for (const row of data) {
    lines.push(headers.map(h => escapeCsvValue(row[h])).join(','));
  }

  return lines.join('\n');
}
