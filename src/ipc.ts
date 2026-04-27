import { invoke } from "@tauri-apps/api/core";
import type {
  ConfigStatus,
  DuplicateCheckResult,
  DuplicateHit,
  GoogleUser,
  LogEntry,
  ResolvedAttachment,
  SessionDoc,
  SessionMeta,
  Sheet,
} from "./data";

type RawSessionMeta = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

const metaFromRaw = (r: RawSessionMeta): SessionMeta => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

type RawSheet = {
  path: string;
  sheet_name: string;
  available_sheets: string[];
  columns: string[];
  rows: string[][];
};

type RawResolvedAttachment = {
  row_index: number;
  resolved_name: string;
  matched_path: string | null;
  note?: string | null;
};

export const ipc = {
  configStatus: () => invoke<ConfigStatus>("config_status"),

  loadSpreadsheet: async (path: string, sheetName?: string): Promise<Sheet> => {
    const raw = await invoke<RawSheet>("load_spreadsheet", {
      path,
      sheetName: sheetName ?? null,
    });
    return {
      path: raw.path,
      sheetName: raw.sheet_name,
      availableSheets: raw.available_sheets,
      columns: raw.columns,
      rows: raw.rows,
    };
  },

  resolveAttachments: async (args: {
    folder: string;
    pattern: string;
    rows: Record<string, string>[];
    caseInsensitive: boolean;
    fuzzy: boolean;
  }): Promise<ResolvedAttachment[]> => {
    const raw = await invoke<RawResolvedAttachment[]>("resolve_attachments", {
      folder: args.folder,
      pattern: args.pattern,
      rows: args.rows,
      caseInsensitive: args.caseInsensitive,
      fuzzy: args.fuzzy,
    });
    return raw.map((r) => ({
      rowIndex: r.row_index,
      resolvedName: r.resolved_name,
      matchedPath: r.matched_path,
      note: r.note ?? null,
    }));
  },

  startGoogleAuth: () => invoke<GoogleUser>("start_google_auth"),
  currentUser: () => invoke<GoogleUser | null>("current_user"),
  signOut: () => invoke<void>("sign_out"),

  sendOne: async (args: {
    toEmail: string;
    toName?: string | null;
    cc: string[];
    subject: string;
    bodyHtml: string;
    subjectTemplate: string;
    bodyTemplate: string;
    attachments: string[];
  }): Promise<{ messageId: string; threadId: string }> => {
    const raw = await invoke<{ gmail_message_id: string; thread_id: string }>(
      "send_one",
      {
        args: {
          to_email: args.toEmail,
          to_name: args.toName ?? null,
          cc: args.cc,
          subject: args.subject,
          body_html: args.bodyHtml,
          subject_template: args.subjectTemplate,
          body_template: args.bodyTemplate,
          attachments: args.attachments,
        },
      }
    );
    return { messageId: raw.gmail_message_id, threadId: raw.thread_id };
  },

  checkDuplicates: async (args: {
    rows: {
      rowIndex: number;
      recipient: string;
      bodyHtml: string;
      subjectTemplate: string;
      bodyTemplate: string;
      attachments: string[];
    }[];
    lookbackDays: number;
    skipGmail?: boolean;
  }): Promise<DuplicateCheckResult> => {
    type RawHit = {
      row_index: number;
      source: "local" | "gmail";
      prior_sent_at: string;
      prior_message_id: string;
      prior_subject: string;
    };
    type RawResult = { hits: RawHit[]; checked_rows: number; errors: string[] };
    const raw = await invoke<RawResult>("check_duplicates", {
      args: {
        rows: args.rows.map((r) => ({
          row_index: r.rowIndex,
          recipient: r.recipient,
          body_html: r.bodyHtml,
          subject_template: r.subjectTemplate,
          body_template: r.bodyTemplate,
          attachments: r.attachments,
        })),
        lookback_days: args.lookbackDays,
        skip_gmail: args.skipGmail ?? false,
      },
    });
    const hits: DuplicateHit[] = raw.hits.map((h) => ({
      rowIndex: h.row_index,
      source: h.source,
      priorSentAt: h.prior_sent_at,
      priorMessageId: h.prior_message_id,
      priorSubject: h.prior_subject,
    }));
    return { hits, checkedRows: raw.checked_rows, errors: raw.errors };
  },

  listSessions: async (): Promise<SessionMeta[]> => {
    const raw = await invoke<RawSessionMeta[]>("list_sessions");
    return raw.map(metaFromRaw);
  },
  listTrash: async (): Promise<SessionMeta[]> => {
    const raw = await invoke<RawSessionMeta[]>("list_trash");
    return raw.map(metaFromRaw);
  },
  loadSession: async (id: string): Promise<SessionDoc> => {
    const raw = await invoke<Record<string, unknown>>("load_session", { id });
    // Rust writes snake_case but for session docs the frontend owns the schema,
    // so we dump whatever we wrote. The only keys set by backend are
    // schema_version and id; translate those.
    const out: any = { ...raw };
    if ("schema_version" in out) {
      out.schemaVersion = out.schema_version;
      delete out.schema_version;
    }
    return out as SessionDoc;
  },
  saveSession: async (id: string, doc: SessionDoc): Promise<SessionMeta> => {
    // Mirror: strip camelCase we never want on disk. We keep the frontend shape
    // as-is since we read it back verbatim. Backend only touches schema_version + id.
    const payload = { ...doc, schema_version: doc.schemaVersion };
    const raw = await invoke<RawSessionMeta>("save_session", { id, doc: payload });
    return metaFromRaw(raw);
  },
  createSession: async (name: string): Promise<SessionMeta> => {
    const raw = await invoke<RawSessionMeta>("create_session", { name });
    return metaFromRaw(raw);
  },
  renameSession: (id: string, name: string) =>
    invoke<void>("rename_session", { id, name }),
  deleteSession: (id: string) => invoke<void>("delete_session", { id }),
  restoreSession: (id: string) => invoke<void>("restore_session", { id }),
  purgeSession: (id: string) => invoke<void>("purge_session", { id }),

  exportLog: (entries: LogEntry[]) =>
    invoke<string>("export_log", {
      entries: entries.map((e) => ({
        row_index: e.rowIndex,
        recipient: e.recipient,
        subject: e.subject,
        status: e.status,
        timestamp: e.timestamp,
        message_id: e.messageId ?? null,
        error: e.error ?? null,
      })),
    }),
};
