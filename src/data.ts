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

export type UnmatchedFile = {
  name: string;
  path: string;
  matchedSheet: string | null;
};

export type ResolveResult = {
  rows: ResolvedAttachment[];
  unmatchedFiles: UnmatchedFile[];
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

export type SessionMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Campaign state serialized per session. The sheet is stored by reference only
 * — `sheetRef.path` + `sheetName` — so we don't duplicate xlsx data on disk.
 * Columns + rowCount are kept for fast display + to detect drift on resume.
 */
export type SessionDoc = {
  schemaVersion: number;
  id: string;
  name: string;
  activeStep: StepKey;
  sheetRef: {
    path: string;
    sheetName: string;
    availableSheets: string[];
    columns: string[];
    rowCount: number;
  } | null;
  template: string;
  subject: string;
  cc: string[];
  rules: Rules;
  attachmentsFolder: string | null;
  fixed: FixedFile[];
  emailColumn: string | null;
  nameColumn: string | null;
  deferMissing: boolean;
  sendStatus: RowStatus[];
  sendErrors: Record<number, string>;
  logEntries: LogEntry[];
  sendDupHits: Record<number, DuplicateHit[]> | null;
  sendDupErrors: string[];
};

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

// Splits an Email Address cell that may hold multiple recipients separated by
// any of: , ; : / \ or whitespace. Permissive — no format validation; trim and
// drop empty parts only. Malformed addresses propagate to the backend, which
// returns a Gmail API error that the failure UI surfaces.
const RECIPIENT_DELIM = /[,;:/\\\s]+/;
export function splitRecipients(raw: string): string[] {
  return (raw ?? "")
    .split(RECIPIENT_DELIM)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function rowRecord(sheet: Sheet, idx: number): Record<string, string> {
  const rec: Record<string, string> = {};
  const row = sheet.rows[idx] ?? [];
  sheet.columns.forEach((c, i) => {
    rec[c] = row[i] ?? "";
  });
  return rec;
}

export function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "20th April, 2026" style — day with English ordinal, full month, year. */
export function formatOrdinalDate(d: Date = new Date()): string {
  const day = d.getDate();
  const suffixes = ["th", "st", "nd", "rd"];
  const v = day % 100;
  const suffix = suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${day}${suffix} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

/**
 * Built-in tokens — resolved dynamically at substitution time, independent
 * of the loaded sheet. Column values from the spreadsheet take precedence
 * over built-ins (so a column literally named "Today" still wins), but in
 * practice built-ins only kick in when no matching column exists.
 */
export type BuiltInToken = {
  key: string;
  label: string;
  preview: () => string;
};

export const BUILT_IN_TOKENS: BuiltInToken[] = [
  {
    key: "Today",
    label: `Today's date (e.g. ${formatOrdinalDate()})`,
    preview: () => formatOrdinalDate(),
  },
];

function builtInValue(key: string): string | undefined {
  if (key === "Today") return formatOrdinalDate();
  return undefined;
}

export function resolveTokens(text: string, row: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    if (row[k] !== undefined) return row[k];
    const b = builtInValue(k);
    return b !== undefined ? b : m;
  });
}

export function resolveTokensHtml(html: string, row: Record<string, string>): string {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    if (row[k] !== undefined) return htmlEscape(row[k]);
    const b = builtInValue(k);
    return b !== undefined ? htmlEscape(b) : m;
  });
}
