export type StepKey = "sheet" | "template" | "attachments" | "auth" | "send";
export type StepDef = { key: StepKey; label: string; hint: string };
export type AuthState = "idle" | "connecting" | "connected";
export type RowStatus = "pending" | "sent" | "skipped" | "blocked" | "failed";

export type Rules = {
  pattern: string;
  caseInsensitive: boolean;
  fuzzy: boolean;
  required: boolean;
};

export type Sheet = {
  path: string;
  sheetName: string;
  availableSheets: string[];
  columns: string[];
  rows: string[][];
};

export type FixedFile = { name: string; path: string; size?: string };

export type GoogleUser = {
  email: string;
  name: string;
  picture: string | null;
};

export type ResolvedAttachment = {
  rowIndex: number;
  resolvedName: string;
  matchedPath: string | null;
  note?: string | null;
};

export type LogEntry = {
  rowIndex: number;
  recipient: string;
  subject: string;
  status: "sent" | "skipped" | "blocked" | "failed";
  timestamp: string;
  messageId?: string | null;
  error?: string | null;
};

export type ConfigStatus = { present: boolean; path: string };

export type DuplicateHit = {
  rowIndex: number;
  source: "local" | "gmail";
  priorSentAt: string;
  priorMessageId: string;
  priorSubject: string;
};

export type DuplicateCheckResult = {
  hits: DuplicateHit[];
  checkedRows: number;
  errors: string[];
};

export const STEPS: StepDef[] = [
  { key: "sheet", label: "Spreadsheet", hint: "Choose source" },
  { key: "template", label: "Template", hint: "Compose message" },
  { key: "attachments", label: "Attachments", hint: "Per-row & fixed" },
  { key: "auth", label: "Gmail", hint: "Authenticate" },
  { key: "send", label: "Review & send", hint: "Row-by-row" },
];

export const DEFAULT_TEMPLATE = "<p></p>";
export const DEFAULT_SUBJECT = "";
export const DEFAULT_PATTERN = "";

/**
 * Generates sensible starting values for template/subject/pattern from the
 * actual column headers of the loaded spreadsheet. Lets us avoid shipping
 * Marchetti-Studio-flavored hardcoded tokens as defaults — the user's sheet
 * will almost never have a `ClientName` or `InvoiceNumber` column.
 */
export function buildSmartDefaults(columns: string[]): {
  template: string;
  subject: string;
  pattern: string;
} {
  const nameColumn =
    columns.find((c) => /^(first\s*name|full\s*name|name|client|customer|contact|recipient)$/i.test(c)) ??
    columns.find((c) => /name|client|customer|contact|recipient/i.test(c)) ??
    columns.find((c) => !/email|phone|address|url|id$/i.test(c)) ??
    columns[0] ??
    "Name";
  return {
    template: `<p>Hi {{${nameColumn}}},</p><p></p><p></p><p>Best regards,</p>`,
    subject: "",
    pattern: `{{${nameColumn}}}.pdf`,
  };
}

export function rowRecord(sheet: Sheet, idx: number): Record<string, string> {
  const rec: Record<string, string> = {};
  const row = sheet.rows[idx] ?? [];
  sheet.columns.forEach((c, i) => {
    rec[c] = row[i] ?? "";
  });
  return rec;
}

export function resolveTokens(text: string, row: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (row[k] !== undefined ? row[k] : m));
}

export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resolveTokensHtml(html: string, row: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (row[k] !== undefined ? htmlEscape(row[k]) : m));
}
