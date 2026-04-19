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

export const DEFAULT_TEMPLATE = `<p>Dear {{ClientName}},</p>
<p>Thank you for trusting the studio with {{ProjectTitle}}. Please find attached invoice {{InvoiceNumber}} for {{Amount}}, payable by {{DueDate}}.</p>
<p>Bank details and our current terms are included for your records.</p>
<p>If anything looks off, write back — I'll happily revise. Otherwise, it was a real pleasure working with {{CompanyName}} this season.</p>
<p>Warmly,</p>`;

export const DEFAULT_SUBJECT = "Invoice {{InvoiceNumber}} · {{ProjectTitle}}";

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
