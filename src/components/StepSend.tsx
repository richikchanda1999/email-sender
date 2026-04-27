import React from "react";
import {
  Sheet,
  Rules,
  FixedFile,
  RowStatus,
  ResolvedAttachment,
  GoogleUser,
  LogEntry,
  AuthState,
  DuplicateHit,
  rowRecord,
  resolveTokens,
  resolveTokensHtml,
} from "../data";
import { StepShell, Pill, primaryBtn, ghostBtn, linkBtn } from "../primitives";
import { ArchDivider } from "./WindowChrome";
import { IconCheck, IconMail, IconPaperclip, IconSend, IconX, IconDoc } from "../icons";
import { Spinner } from "./StepAuth";
import { Toggle } from "./StepAttachments";
import { ipc } from "../ipc";

type RowMeta = {
  record: Record<string, string>;
  emailColumn: string;
  nameColumn: string;
};

function findEmailColumn(columns: string[]): string {
  return (
    columns.find((c) => /^email$/i.test(c)) ??
    columns.find((c) => /email/i.test(c)) ??
    columns[0] ??
    ""
  );
}

function findNameColumn(columns: string[], emailCol: string): string {
  return (
    columns.find((c) => /^(client\s*name|name)$/i.test(c)) ??
    columns.find((c) => /name/i.test(c) && c !== emailCol) ??
    columns.find((c) => c !== emailCol) ??
    ""
  );
}

export function StepSend({
  sheet,
  template,
  subject,
  cc,
  rules,
  resolved,
  fixed,
  user,
  setUser,
  setAuthState,
  emailColumn: emailColumnProp,
  nameColumn: nameColumnProp,
  logEntries,
  setLogEntries,
  status,
  setStatus,
  errors,
  setErrors,
  dupHits,
  setDupHits,
  dupErrors,
  setDupErrors,
  deferMissing,
  setDeferMissing,
  onRestart,
  density,
}: {
  sheet: Sheet | null;
  template: string;
  subject: string;
  cc: string[];
  rules: Rules;
  resolved: ResolvedAttachment[];
  fixed: FixedFile[];
  user: GoogleUser | null;
  setUser: React.Dispatch<React.SetStateAction<GoogleUser | null>>;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  emailColumn: string | null;
  nameColumn: string | null;
  logEntries: LogEntry[];
  setLogEntries: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  status: RowStatus[];
  setStatus: React.Dispatch<React.SetStateAction<RowStatus[]>>;
  errors: Record<number, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  dupHits: Record<number, DuplicateHit[]> | null;
  setDupHits: React.Dispatch<React.SetStateAction<Record<number, DuplicateHit[]> | null>>;
  dupErrors: string[];
  setDupErrors: React.Dispatch<React.SetStateAction<string[]>>;
  deferMissing: boolean;
  setDeferMissing: React.Dispatch<React.SetStateAction<boolean>>;
  onRestart: () => void;
  density: "cozy" | "compact";
}) {
  const columns = sheet?.columns ?? [];
  const emailColumn = emailColumnProp ?? findEmailColumn(columns);
  const nameColumn = nameColumnProp ?? findNameColumn(columns, emailColumn);

  const rowMetas: RowMeta[] = React.useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((_, i) => ({
      record: rowRecord(sheet, i),
      emailColumn,
      nameColumn,
    }));
  }, [sheet, emailColumn, nameColumn]);

  const norm = (e: string) => (e || "").trim().toLowerCase();
  const firstIdxByEmail = React.useMemo(() => {
    const map = new Map<string, number>();
    rowMetas.forEach((r, i) => {
      const k = norm(r.record[emailColumn] ?? "");
      if (k && !map.has(k)) map.set(k, i);
    });
    return map;
  }, [rowMetas, emailColumn]);

  const sameAddressInfo = React.useCallback(
    (i: number): { label: string; firstIdx: number } | null => {
      const r = rowMetas[i];
      if (!r) return null;
      const k = norm(r.record[emailColumn] ?? "");
      if (!k) return null;
      const first = firstIdxByEmail.get(k);
      if (first === undefined || first === i) return null;
      return { label: `same address as row ${first + 1}`, firstIdx: first };
    },
    [rowMetas, firstIdxByEmail, emailColumn]
  );

  const [currentIdx, setCurrentIdx] = React.useState<number | null>(null);
  const [sending, setSending] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [authExpired, setAuthExpired] = React.useState(false);
  const [reauthing, setReauthing] = React.useState(false);
  const [dupChecking, setDupChecking] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<"all" | RowStatus>("all");
  const [searchText, setSearchText] = React.useState("");
  const [perRowDupe, setPerRowDupe] = React.useState<DuplicateHit[] | null>(null);
  const [perRowDupeChecking, setPerRowDupeChecking] = React.useState(false);

  const attachmentsConfigured = resolved.length > 0;
  const hasAttachment = React.useCallback(
    (i: number) => !attachmentsConfigured || !!resolved[i]?.matchedPath,
    [attachmentsConfigured, resolved]
  );

  const isAuthError = (msg: string) =>
    /not signed in|invalid_grant|refresh|unauthorized|401|token has been expired|token expired/i.test(
      msg
    );

  const reauth = async () => {
    setReauthing(true);
    try {
      const u = await ipc.startGoogleAuth();
      setUser(u);
      setAuthState("connected");
      setAuthExpired(false);
    } catch (e) {
      // Leave the banner up so the user can try again
      console.error("reauth:", e);
    } finally {
      setReauthing(false);
    }
  };

  // Initialize status array only when its length diverges from rowMetas — e.g. on
  // the first render, or after App cleared it via the sheet-change effect. Do NOT
  // reset on every remount (tab navigation) — the lifted state already survives
  // unmount, and re-resetting would wipe a campaign-in-progress.
  React.useEffect(() => {
    if (status.length !== rowMetas.length) {
      setStatus(rowMetas.map(() => "pending"));
      setErrors({});
      setCurrentIdx(null);
    }
  }, [rowMetas.length, status.length, setStatus, setErrors]);

  const resolve = (t: string, row: Record<string, string>) => resolveTokens(t, row);
  const findNextPending = React.useCallback(
    (s: RowStatus[]) => {
      if (deferMissing && attachmentsConfigured) {
        const first = s.findIndex((v, i) => v === "pending" && hasAttachment(i));
        if (first >= 0) return first;
      }
      return s.findIndex((v) => v === "pending");
    },
    [deferMissing, attachmentsConfigured, hasAttachment]
  );

  const heldCount = React.useMemo(
    () =>
      attachmentsConfigured
        ? status.filter((v, i) => v === "pending" && !hasAttachment(i)).length
        : 0,
    [status, attachmentsConfigured, hasAttachment]
  );

  const filteredRows = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rowMetas
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => {
        const st = status[i] ?? "pending";
        if (statusFilter !== "all" && st !== statusFilter) return false;
        if (!q) return true;
        const rec = r.record;
        const hay = [
          rec[nameColumn] ?? "",
          rec[emailColumn] ?? "",
          resolveTokens(subject, rec),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [rowMetas, status, statusFilter, searchText, nameColumn, emailColumn, subject]);

  const startRun = () => {
    setPaused(false);
    const firstIdx = findNextPending(status);
    if (firstIdx >= 0) setCurrentIdx(firstIdx);
  };

  const buildAttachments = (i: number): string[] => {
    const perRow = resolved[i]?.matchedPath ?? null;
    const paths: string[] = [];
    if (perRow) paths.push(perRow);
    fixed.forEach((f) => paths.push(f.path));
    return paths;
  };

  // Per-row pre-send dupe check. Fires whenever the confirm modal opens on a new
  // row. Local-only (skipGmail: true) so modal open stays snappy; the "Check for
  // duplicates" button is the authoritative Gmail-inclusive check.
  React.useEffect(() => {
    if (currentIdx === null || !sheet) {
      setPerRowDupe(null);
      return;
    }
    const i = currentIdx;
    const meta = rowMetas[i];
    if (!meta) return;
    const rec = meta.record;
    const toEmail = rec[emailColumn] ?? "";
    if (!toEmail.trim()) {
      setPerRowDupe(null);
      return;
    }
    const bodyHtml = resolveTokensHtml(template, rec);
    const attachments = buildAttachments(i);

    let cancelled = false;
    setPerRowDupeChecking(true);
    (async () => {
      try {
        const result = await ipc.checkDuplicates({
          rows: [
            {
              rowIndex: i,
              recipient: toEmail,
              bodyHtml,
              subjectTemplate: subject,
              bodyTemplate: template,
              attachments,
            },
          ],
          lookbackDays: 90,
          skipGmail: true,
        });
        if (cancelled) return;
        setPerRowDupe(result.hits.length > 0 ? result.hits : null);
      } catch (e) {
        if (!cancelled) setPerRowDupe(null);
        console.warn("per-row dupe check:", e);
      } finally {
        if (!cancelled) setPerRowDupeChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentIdx, sheet, template, emailColumn, rowMetas, resolved, fixed]);

  const appendLog = (entry: LogEntry) => {
    setLogEntries((l) => [...l, entry]);
  };

  const confirmSend = async () => {
    if (currentIdx === null || !sheet) return;
    const i = currentIdx;
    const meta = rowMetas[i];
    const record = meta.record;
    const toEmail = record[emailColumn] ?? "";
    const toName = record[nameColumn] ?? null;
    const resolvedSubject = resolve(subject, record);
    const resolvedBodyHtml = resolveTokensHtml(template, record);
    const attachments = buildAttachments(i);
    const perRowRequired = rules.required;
    const perRowMissing = !resolved[i]?.matchedPath;

    if (perRowRequired && perRowMissing) {
      const msg = "per-row attachment required but missing";
      setStatus((s) => s.map((v, j) => (j === i ? "skipped" : v)) as RowStatus[]);
      setErrors((e) => ({ ...e, [i]: msg }));
      appendLog({
        rowIndex: i,
        recipient: toEmail,
        subject: resolvedSubject,
        status: "skipped",
        timestamp: new Date().toISOString(),
        error: msg,
      });
      const next = findNextPending(status.map((v, j) => (j === i ? "skipped" : v)) as RowStatus[]);
      if (next >= 0 && !paused) setCurrentIdx(next);
      else setCurrentIdx(null);
      return;
    }

    setSending(true);
    try {
      const result = await ipc.sendOne({
        toEmail,
        toName,
        cc,
        subject: resolvedSubject,
        bodyHtml: resolvedBodyHtml,
        subjectTemplate: subject,
        bodyTemplate: template,
        attachments,
      });
      const newStatus = status.map((v, j) => (j === i ? "sent" : v)) as RowStatus[];
      setStatus(newStatus);
      appendLog({
        rowIndex: i,
        recipient: toEmail,
        subject: resolvedSubject,
        status: "sent",
        timestamp: new Date().toISOString(),
        messageId: result.messageId,
      });
      setErrors((e) => {
        const { [i]: _drop, ...rest } = e;
        return rest;
      });
      const next = findNextPending(newStatus);
      if (next >= 0 && !paused) setCurrentIdx(next);
      else setCurrentIdx(null);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message ?? "send failed";
      setStatus((s) => s.map((v, j) => (j === i ? "failed" : v)) as RowStatus[]);
      setErrors((es) => ({ ...es, [i]: msg }));
      appendLog({
        rowIndex: i,
        recipient: toEmail,
        subject: resolvedSubject,
        status: "failed",
        timestamp: new Date().toISOString(),
        error: msg,
      });
      if (isAuthError(msg)) {
        setAuthExpired(true);
        // Also clear the local user so the UI reflects the expired session
        setUser(null);
        setAuthState("idle");
      }
      setCurrentIdx(null);
    } finally {
      setSending(false);
    }
  };

  const skipOne = () => {
    if (currentIdx === null) return;
    const i = currentIdx;
    const meta = rowMetas[i];
    const record = meta.record;
    const newStatus = status.map((v, j) => (j === i ? "skipped" : v)) as RowStatus[];
    setStatus(newStatus);
    appendLog({
      rowIndex: i,
      recipient: record[emailColumn] ?? "",
      subject: resolve(subject, record),
      status: "skipped",
      timestamp: new Date().toISOString(),
    });
    const next = findNextPending(newStatus);
    if (next >= 0) setCurrentIdx(next);
    else setCurrentIdx(null);
  };

  const unblockRow = (i: number) => {
    setStatus((s) => s.map((v, j) => (j === i ? "pending" : v)) as RowStatus[]);
  };

  const retryRow = (i: number) => {
    setErrors((e) => {
      const { [i]: _drop, ...rest } = e;
      return rest;
    });
    setStatus((s) => s.map((v, j) => (j === i ? "pending" : v)) as RowStatus[]);
  };

  const [exporting, setExporting] = React.useState(false);
  const [exportMsg, setExportMsg] = React.useState<string | null>(null);

  const runDuplicateCheck = async () => {
    if (!sheet || !user) return;
    setDupChecking(true);
    setDupErrors([]);
    try {
      const rowsPayload = rowMetas
        .map((m, i) => {
          const rec = m.record;
          const toEmail = rec[emailColumn] ?? "";
          if (!toEmail.trim()) return null;
          const bodyHtml = resolveTokensHtml(template, rec);
          const attachments = buildAttachments(i);
          return {
            rowIndex: i,
            recipient: toEmail,
            bodyHtml,
            subjectTemplate: subject,
            bodyTemplate: template,
            attachments,
          };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);
      const result = await ipc.checkDuplicates({ rows: rowsPayload, lookbackDays: 90 });
      const grouped: Record<number, DuplicateHit[]> = {};
      for (const h of result.hits) {
        if (!grouped[h.rowIndex]) grouped[h.rowIndex] = [];
        grouped[h.rowIndex].push(h);
      }
      setDupHits(grouped);
      setDupErrors(result.errors);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message ?? "duplicate check failed";
      setDupErrors([msg]);
      if (isAuthError(msg)) {
        setAuthExpired(true);
      }
    } finally {
      setDupChecking(false);
    }
  };
  const exportLog = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const path = await ipc.exportLog(logEntries);
      setExportMsg(`Saved: ${path}`);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : e?.message ?? "export failed";
      if (!/cancelled/i.test(msg)) setExportMsg(msg);
    } finally {
      setExporting(false);
    }
  };

  if (!sheet) {
    return (
      <StepShell title="Review & send" sub="No spreadsheet loaded." density={density} wide>
        <div style={{ marginTop: 40, padding: 36, background: "var(--panel)", borderRadius: 12, color: "var(--ink-dim)", fontSize: 13 }}>
          Load a spreadsheet first.
        </div>
      </StepShell>
    );
  }

  const total = rowMetas.length;
  const sentCount = status.filter((s) => s === "sent").length;
  const skippedCount = status.filter((s) => s === "skipped").length;
  const pendingCount = status.filter((s) => s === "pending").length;
  const blockedCount = status.filter((s) => s === "blocked").length;
  const failedCount = status.filter((s) => s === "failed").length;

  return (
    <StepShell title="Review & send" sub="Each row waits for your nod before it goes out." density={density} wide>
      <div
        style={{
          marginTop: 16,
          padding: "12px 16px",
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          fontSize: 12.5,
          color: "var(--ink-dim)",
          lineHeight: 1.65,
        }}
      >
        <div style={{ color: "var(--ink)", fontWeight: 500, marginBottom: 4 }}>Before you start</div>
        Nothing gets sent until you click <strong>Confirm &amp; send</strong> on each row. Click{" "}
        <strong>Check for duplicates</strong> to scan the last 90 days (this app's local log plus your
        Gmail Sent folder) for an identical body + attachments — a safety net against re-sending the same
        email. The <em>hold rows with missing attachments for last</em> toggle processes complete rows
        first and circles back to any missing-attachment rows at the end, so you can drop files in mid-run.
      </div>
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 0,
          border: "1px solid var(--line)",
          borderRadius: 14,
          background: "var(--bg)",
          overflow: "hidden",
        }}
      >
        <Stat label="Total" value={total} />
        <Stat label="Sent" value={sentCount} tone="sage" />
        <Stat label="Skipped" value={skippedCount} tone="terra" />
        <Stat label="Blocked" value={blockedCount} tone="terra" />
        <Stat label="Failed" value={failedCount} tone="terra" />
        <Stat label="Pending" value={pendingCount} />
      </div>

      {(blockedCount > 0 || cc.length > 0) && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {blockedCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink)" }}>
              <Pill tone="terra">{blockedCount} blocked</Pill>
              <span style={{ color: "var(--ink-dim)" }}>addresses repeated within the sheet — won't fire twice.</span>
            </div>
          )}
          {cc.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <Pill tone="sage">
                <IconMail size={10} />
                Cc {cc.length}
              </Pill>
              <span style={{ color: "var(--ink-dim)" }}>{cc.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 18,
          height: 6,
          borderRadius: 3,
          background: "var(--panel)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            width: `${(sentCount / Math.max(1, total)) * 100}%`,
            height: "100%",
            background: "var(--sage)",
            transition: "width 300ms",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${(sentCount / Math.max(1, total)) * 100}%`,
            width: `${((skippedCount + failedCount) / Math.max(1, total)) * 100}%`,
            height: "100%",
            background: "var(--terracotta)",
            opacity: 0.5,
            transition: "all 300ms",
          }}
        />
      </div>

      {/* Filter + search controls for large campaigns. */}
      <div
        style={{
          marginTop: 18,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(
            [
              ["all", "All", total],
              ["pending", "Pending", pendingCount],
              ["sent", "Sent", sentCount],
              ["failed", "Failed", failedCount],
              ["skipped", "Skipped", skippedCount],
              ["blocked", "Blocked", blockedCount],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key as typeof statusFilter)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "5px 11px",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 500,
                border: "1px solid " + (statusFilter === key ? "var(--terracotta)" : "var(--line-strong)"),
                color: statusFilter === key ? "var(--terracotta)" : "var(--ink-dim)",
                background: statusFilter === key ? "rgba(169,132,103,0.10)" : "var(--bg)",
              }}
            >
              {label}
              <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 10.5 }}>{count}</span>
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Filter by recipient or subject…"
          style={{
            minWidth: 240,
            padding: "6px 12px",
            border: "1px solid var(--line-strong)",
            borderRadius: 999,
            background: "var(--bg)",
            fontSize: 12.5,
            color: "var(--ink)",
            outline: "none",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 10,
          border: "1px solid var(--line)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--bg)",
          maxHeight: 520,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ overflowY: "auto", overflowX: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "24px 1.2fr 1.4fr 1fr 160px",
            padding: "10px 16px",
            background: "var(--panel)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: "var(--ink-dim)",
            borderBottom: "1px solid var(--line)",
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          <div></div>
          <div>Recipient</div>
          <div>Subject</div>
          <div>Attachments</div>
          <div>Status</div>
        </div>
        {filteredRows.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 12.5, color: "var(--ink-soft)" }}>
            No rows match the current filter.
          </div>
        )}
        {filteredRows.map(({ r, i }) => {
          const st = status[i] ?? "pending";
          const isCurrent = i === currentIdx;
          const dup = sameAddressInfo(i);
          const rec = r.record;
          const perRowAttached = resolved[i]?.matchedPath ? 1 : 0;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1.2fr 1.4fr 1fr 160px",
                padding: "12px 16px",
                alignItems: "center",
                borderBottom: i === rowMetas.length - 1 ? "none" : "1px solid var(--line)",
                background: isCurrent ? "rgba(169,132,103,0.08)" : "transparent",
                fontSize: 12.5,
                opacity: st === "blocked" ? 0.75 : 1,
              }}
            >
              <div style={{ color: "var(--ink-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: 10.5 }}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {rec[nameColumn] || rec[emailColumn] || `Row ${i + 1}`}
                  {dup && (
                    <span
                      style={{
                        fontSize: 9.5,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        color: "var(--terracotta)",
                        border: "1px solid rgba(169,132,103,0.45)",
                        borderRadius: 4,
                        padding: "1px 5px",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {dup.label}
                    </span>
                  )}
                  {dupHits?.[i] && dupHits[i].length > 0 && (
                    <span
                      title={dupHits[i]
                        .map(
                          (h) =>
                            `[${h.source}] ${h.priorSentAt.slice(0, 10)} — ${h.priorSubject}`
                        )
                        .join("\n")}
                      style={{
                        fontSize: 9.5,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        color: "#7A5A3C",
                        background: "rgba(212,163,115,0.18)",
                        border: "1px solid rgba(212,163,115,0.55)",
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      duplicate · {dupHits[i][0].source}
                      {dupHits[i].length > 1 ? ` +${dupHits[i].length - 1}` : ""}
                    </span>
                  )}
                </div>
                <div style={{ color: "var(--ink-soft)", fontSize: 11 }}>{rec[emailColumn] ?? ""}</div>
              </div>
              <div style={{ color: "var(--ink-dim)", fontFamily: "Fraunces, serif", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {resolve(subject, rec)}
              </div>
              <div style={{ color: "var(--ink-dim)", fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}>
                <IconPaperclip size={11} />
                <span>{fixed.length + perRowAttached} files</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {st === "sent" && (
                  <Pill tone="sage">
                    <IconCheck size={10} />
                    sent
                  </Pill>
                )}
                {st === "skipped" && <Pill tone="terra">skipped</Pill>}
                {st === "failed" && (
                  <>
                    <span title={errors[i]}>
                      <Pill tone="terra">failed</Pill>
                    </span>
                    <button
                      onClick={() => retryRow(i)}
                      title={errors[i] ?? "retry"}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        fontSize: 10.5,
                        color: "var(--ink-soft)",
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      retry
                    </button>
                  </>
                )}
                {st === "blocked" && (
                  <>
                    <Pill tone="terra">blocked</Pill>
                    <button
                      onClick={() => unblockRow(i)}
                      title="Send anyway"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        fontSize: 10.5,
                        color: "var(--ink-soft)",
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      override
                    </button>
                  </>
                )}
                {st === "pending" && !isCurrent && <Pill tone="ink">queued</Pill>}
                {isCurrent && <Pill tone="sand">reviewing</Pill>}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 22, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={startRun}
          disabled={pendingCount === 0 || !user}
          style={{
            ...primaryBtn({ wide: true }),
            opacity: pendingCount === 0 || !user ? 0.4 : 1,
          }}
        >
          <IconSend size={14} />
          {sentCount === 0 ? "Begin sending" : "Resume sending"}
        </button>
        <button
          onClick={runDuplicateCheck}
          disabled={dupChecking || !user || total === 0}
          style={{
            ...ghostBtn(),
            opacity: !user || total === 0 ? 0.4 : 1,
          }}
          title="Scan local send history and Gmail Sent folder for matching bodies + attachments in the last 90 days"
        >
          {dupChecking ? "Checking…" : "Check for duplicates"}
        </button>
        <button
          onClick={exportLog}
          disabled={exporting || logEntries.length === 0}
          style={{ ...ghostBtn(), opacity: logEntries.length === 0 ? 0.4 : 1 }}
        >
          {exporting ? "Saving…" : "Export log (.csv)"}
        </button>
        {exportMsg && (
          <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>{exportMsg}</span>
        )}
        <span style={{ flex: 1 }} />
        {sentCount + skippedCount + blockedCount + failedCount === total && total > 0 && (
          <button onClick={onRestart} style={linkBtn()}>
            Start a new campaign →
          </button>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          borderRadius: 10,
          background: "var(--panel-soft)",
          border: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          opacity: attachmentsConfigured ? 1 : 0.5,
        }}
      >
        <Toggle
          checked={deferMissing}
          onChange={setDeferMissing}
          label="Hold rows with missing attachments for last"
        />
        <span style={{ flex: 1 }} />
        {attachmentsConfigured ? (
          <span style={{ fontSize: 11.5, color: "var(--ink-dim)" }}>
            {heldCount > 0
              ? `${heldCount} row${heldCount === 1 ? "" : "s"} held for last`
              : "no rows held"}
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--ink-soft)", fontStyle: "italic" }}>
            no attachments folder configured — toggle is inert
          </span>
        )}
      </div>

      {dupHits !== null && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            borderRadius: 10,
            background: "var(--panel)",
            border: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {Object.keys(dupHits).length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink)" }}>
              <Pill tone="sage">
                <IconCheck size={10} />
                no duplicates
              </Pill>
              <span style={{ color: "var(--ink-dim)" }}>
                nothing matching in the last 90 days.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, flex: 1, flexWrap: "wrap" }}>
              <Pill tone="terra">
                {Object.keys(dupHits).length} row{Object.keys(dupHits).length === 1 ? "" : "s"} flagged
              </Pill>
              <span style={{ color: "var(--ink-dim)" }}>
                matching body + attachments found in the last 90 days. Review the rows below or click the pill for details.
              </span>
            </div>
          )}
          <button onClick={() => setDupHits(null)} style={linkBtn()}>
            clear
          </button>
        </div>
      )}
      {dupErrors.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(196,98,63,0.06)",
            border: "1px dashed rgba(196,98,63,0.35)",
            color: "var(--terracotta)",
            fontSize: 11.5,
          }}
        >
          {dupErrors.slice(0, 3).map((e, i) => (
            <div key={i}>{e}</div>
          ))}
          {dupErrors.length > 3 && <div>…and {dupErrors.length - 3} more</div>}
        </div>
      )}

      {(authExpired || !user) && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(196,98,63,0.08)",
            border: "1px solid rgba(196,98,63,0.35)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "var(--terracotta)", fontSize: 12.5, flex: 1 }}>
            {authExpired
              ? "Your Gmail session expired. Sign in again to resume sending."
              : "Sign in to Gmail before sending."}
          </div>
          <button
            onClick={reauth}
            disabled={reauthing}
            style={{ ...primaryBtn(), opacity: reauthing ? 0.6 : 1 }}
          >
            {reauthing ? "Opening browser…" : "Sign in again"}
          </button>
        </div>
      )}

      {currentIdx !== null && (
        <ConfirmModal
          idx={currentIdx}
          total={total}
          record={rowMetas[currentIdx].record}
          emailColumn={emailColumn}
          nameColumn={nameColumn}
          subject={resolve(subject, rowMetas[currentIdx].record)}
          bodyHtml={resolveTokensHtml(template, rowMetas[currentIdx].record)}
          cc={cc}
          rules={rules}
          fixed={fixed}
          perRowAttachment={resolved[currentIdx]?.matchedPath ?? null}
          perRowResolvedName={resolved[currentIdx]?.resolvedName ?? null}
          user={user}
          sending={sending}
          dupeHits={perRowDupe}
          dupeChecking={perRowDupeChecking}
          onConfirm={confirmSend}
          onSkip={skipOne}
          onPause={() => {
            setPaused(true);
            setCurrentIdx(null);
          }}
        />
      )}
    </StepShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "sage" | "terra" }) {
  const colors: Record<string, string> = {
    sage: "var(--sage)",
    terra: "var(--terracotta)",
  };
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRight: "1px solid var(--line)",
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)" }}>{label}</div>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 28,
          fontWeight: 400,
          color: (tone && colors[tone]) || "var(--ink)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ConfirmModal({
  idx,
  total,
  record,
  emailColumn,
  nameColumn,
  subject,
  bodyHtml,
  cc,
  rules: _rules,
  fixed,
  perRowAttachment,
  perRowResolvedName,
  user,
  sending,
  dupeHits,
  dupeChecking,
  onConfirm,
  onSkip,
  onPause,
}: {
  idx: number;
  total: number;
  record: Record<string, string>;
  emailColumn: string;
  nameColumn: string;
  subject: string;
  bodyHtml: string;
  cc: string[];
  rules: Rules;
  fixed: FixedFile[];
  perRowAttachment: string | null;
  perRowResolvedName: string | null;
  user: GoogleUser | null;
  sending: boolean;
  dupeHits: DuplicateHit[] | null;
  dupeChecking: boolean;
  onConfirm: () => void;
  onSkip: () => void;
  onPause: () => void;
}) {
  const perRowLabel = perRowResolvedName ?? "(no per-row file)";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "rgba(59,50,43,0.32)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: 720,
          maxHeight: "88%",
          background: "var(--bg)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(59,50,43,0.3)",
          border: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--line)",
            background: "var(--panel)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "var(--bg)",
              border: "1px solid var(--terracotta)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Fraunces, serif",
              fontSize: 12,
              color: "var(--terracotta)",
            }}
          >
            {idx + 1}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 16, color: "var(--ink)" }}>
              Send email {idx + 1} of {total}?
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Review carefully — this will go out immediately.</div>
          </div>
          <button onClick={onPause} style={{ ...ghostBtn(), padding: "6px 10px" }}>
            <IconX size={12} />
          </button>
        </div>

        <div style={{ padding: "20px 28px", overflow: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", rowGap: 10, fontSize: 13 }}>
            <div style={{ color: "var(--ink-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, paddingTop: 2 }}>To</div>
            <div style={{ color: "var(--ink)" }}>
              {record[nameColumn] || ""} <span style={{ color: "var(--ink-dim)" }}>&lt;{record[emailColumn] ?? ""}&gt;</span>
            </div>
            <div style={{ color: "var(--ink-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, paddingTop: 2 }}>From</div>
            <div style={{ color: "var(--ink)" }}>
              {user?.name || ""} <span style={{ color: "var(--ink-dim)" }}>&lt;{user?.email ?? ""}&gt;</span>
            </div>
            {cc && cc.length > 0 && (
              <>
                <div style={{ color: "var(--ink-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, paddingTop: 2 }}>Cc</div>
                <div style={{ color: "var(--ink)", display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {cc.map((e, i) => (
                    <span key={e} style={{ color: "var(--ink-dim)" }}>
                      {e}
                      {i < cc.length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div style={{ color: "var(--ink-soft)", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, paddingTop: 2 }}>Subject</div>
            <div style={{ color: "var(--ink)", fontFamily: "Fraunces, serif", fontSize: 15 }}>{subject}</div>
          </div>

          <div style={{ margin: "16px 0" }}>
            <ArchDivider width={200} />
          </div>

          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              lineHeight: 1.75,
              color: "var(--ink)",
              maxHeight: 200,
              overflow: "auto",
              paddingRight: 4,
            }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          <div
            style={{
              marginTop: 20,
              padding: "14px 16px",
              background: "var(--panel)",
              borderRadius: 10,
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)", marginBottom: 10 }}>
              Attachments · {fixed.length + (perRowAttachment ? 1 : 0)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <FileLine name={perRowLabel} tag={perRowAttachment ? "per-row" : "missing"} dim={!perRowAttachment} />
              {fixed.map((f) => (
                <FileLine key={f.path} name={f.name} tag="fixed" />
              ))}
            </div>
          </div>

          {dupeHits && dupeHits.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: "12px 14px",
                background: "rgba(196,98,63,0.08)",
                border: "1px solid rgba(196,98,63,0.4)",
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--terracotta)", fontWeight: 600, marginBottom: 4 }}>
                ⚠ Already sent
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.55 }}>
                An email with the same body and attachments was already sent to this recipient.
                {dupeHits.slice(0, 3).map((h, i) => (
                  <div key={i} style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-dim)" }}>
                    • {h.priorSentAt.slice(0, 10)} — {h.priorSubject || "(no subject)"}
                    <span style={{ marginLeft: 6, color: "var(--ink-soft)" }}>[{h.source}]</span>
                  </div>
                ))}
                {dupeHits.length > 3 && (
                  <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--ink-soft)" }}>
                    …and {dupeHits.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}
          {dupeChecking && !dupeHits && (
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--ink-soft)", fontStyle: "italic" }}>
              Checking history for duplicates…
            </div>
          )}
        </div>

        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--line)",
            background: "var(--panel-soft)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button onClick={onPause} style={linkBtn()}>
            Pause queue
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={onSkip} disabled={sending} style={ghostBtn()}>
            Skip this row
          </button>
          <button
            onClick={onConfirm}
            disabled={sending || dupeChecking}
            style={{
              ...primaryBtn(),
              opacity: sending || dupeChecking ? 0.7 : 1,
              background:
                dupeHits && dupeHits.length > 0 && !sending
                  ? "var(--terracotta)"
                  : "var(--terracotta)",
            }}
          >
            {sending ? (
              <>
                <Spinner /> Sending…
              </>
            ) : dupeHits && dupeHits.length > 0 ? (
              <>
                <IconSend size={13} /> Send anyway
              </>
            ) : (
              <>
                <IconSend size={13} /> Confirm &amp; send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileLine({ name, tag, dim }: { name: string; tag: string; dim?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        opacity: dim ? 0.65 : 1,
      }}
    >
      <IconDoc size={13} stroke="var(--ink-dim)" />
      <span style={{ fontSize: 12, color: "var(--ink)", fontFamily: "JetBrains Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 10, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1 }}>{tag}</span>
    </div>
  );
}
