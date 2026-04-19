import React from "react";
import mammoth from "mammoth";
import { Sheet, rowRecord, resolveTokens, resolveTokensHtml } from "../data";
import { StepShell } from "../primitives";
import { ArchDivider } from "./WindowChrome";
import { IconGrip } from "../icons";
import { RichTextEditor, RichEditorHandle } from "./RichTextEditor";

export function StepTemplate({
  sheet,
  template,
  setTemplate,
  subject,
  setSubject,
  cc,
  setCc,
  emailColumn,
  setEmailColumn,
  nameColumn,
  setNameColumn,
  density,
}: {
  sheet: Sheet | null;
  template: string;
  setTemplate: React.Dispatch<React.SetStateAction<string>>;
  subject: string;
  setSubject: React.Dispatch<React.SetStateAction<string>>;
  cc: string[];
  setCc: React.Dispatch<React.SetStateAction<string[]>>;
  emailColumn: string | null;
  setEmailColumn: React.Dispatch<React.SetStateAction<string | null>>;
  nameColumn: string | null;
  setNameColumn: React.Dispatch<React.SetStateAction<string | null>>;
  density: "cozy" | "compact";
}) {
  const cozy = density === "cozy";
  const [previewIdx, setPreviewIdx] = React.useState(0);
  const [tab, setTab] = React.useState<"compose" | "preview">("compose");
  const editorRef = React.useRef<RichEditorHandle | null>(null);
  const subjectRef = React.useRef<HTMLInputElement | null>(null);
  const [lastFocused, setLastFocused] = React.useState<"subject" | "body">("body");

  const columns = sheet?.columns ?? [];
  const rowCount = sheet?.rows.length ?? 0;
  const clampedPreview = Math.min(previewIdx, Math.max(0, rowCount - 1));
  const previewRow = sheet ? rowRecord(sheet, clampedPreview) : null;

  const insertTokenIntoSubject = (key: string) => {
    const el = subjectRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      setSubject((s) => s + token);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    setSubject(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertToken = (key: string) => {
    if (lastFocused === "subject") {
      insertTokenIntoSubject(key);
    } else {
      editorRef.current?.insertToken(key);
    }
  };

  const docxInputRef = React.useRef<HTMLInputElement | null>(null);
  const [docxError, setDocxError] = React.useState<string | null>(null);
  const [docxNote, setDocxNote] = React.useState<string | null>(null);
  const [docxBusy, setDocxBusy] = React.useState(false);

  const pickDocx = () => {
    setDocxError(null);
    setDocxNote(null);
    docxInputRef.current?.click();
  };

  const onDocxChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file refires onChange
    if (!file) return;
    setDocxBusy(true);
    setDocxError(null);
    setDocxNote(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      const html = result.value || "<p></p>";
      setTemplate(html);
      editorRef.current?.reset(html);
      if (result.messages?.length) {
        const warnings = result.messages.filter((m) => m.type === "warning").length;
        if (warnings > 0) {
          setDocxNote(
            `Imported. ${warnings} formatting warning${warnings === 1 ? "" : "s"} — complex layouts may not survive the conversion.`
          );
        } else {
          setDocxNote("Imported.");
        }
      } else {
        setDocxNote("Imported.");
      }
    } catch (err: any) {
      setDocxError(
        typeof err === "string" ? err : err?.message ?? "failed to read the .docx file"
      );
    } finally {
      setDocxBusy(false);
    }
  };

  if (!sheet) {
    return (
      <StepShell title="Compose the letter" sub="Load a spreadsheet first to see your column tokens." density={density} wide>
        <div style={{ marginTop: 40, padding: 36, background: "var(--panel)", borderRadius: 12, color: "var(--ink-dim)", fontSize: 13 }}>
          Go back a step and pick a spreadsheet — the column headers become placeholders you drop into your template.
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell title="Compose the letter" sub="Drag a column into the body, or click to insert at the cursor." density={density} wide>
      <input
        ref={docxInputRef}
        type="file"
        accept=".docx"
        style={{ display: "none" }}
        onChange={onDocxChosen}
      />
      <div
        style={{
          marginTop: 16,
          padding: "12px 16px",
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          fontSize: 12.5,
          color: "var(--ink-dim)",
          lineHeight: 1.6,
        }}
      >
        Write your message once. Wrap a column name in <code style={codeStyle()}>{"{{ }}"}</code> to pull per-row values —
        e.g. <code style={codeStyle()}>Hi {"{{"}{columns[0] ?? "Name"}{"}}"},</code> becomes{" "}
        <code style={codeStyle()}>Hi {previewRow ? previewRow[columns[0] ?? ""] ?? "Alice" : "Alice"},</code> on that row.
        Drag a column from the left, click a chip to insert at the cursor, or type{" "}
        <code style={codeStyle()}>{"{{"}</code> yourself. To bring in a formatted letter from Word (including
        signature images), use <strong>Import .docx</strong> above the editor.
      </div>
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "220px 1fr",
          gap: 22,
        }}
      >
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)", marginBottom: 10 }}>Columns</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {columns.map((c) => (
              <div
                key={c}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", `{{${c}}}`);
                }}
                onClick={() => insertToken(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  cursor: "grab",
                  userSelect: "none",
                }}
              >
                <IconGrip size={12} stroke="var(--ink-soft)" />
                <div style={{ display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" }}>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11.5,
                      color: "var(--terracotta)",
                    }}
                  >{`{{${c}}}`}</span>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--ink-soft)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {previewRow?.[c] ?? ""}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ margin: "18px 0 10px" }}>
            <ArchDivider width={200} />
          </div>

          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)", marginBottom: 10 }}>Preview row</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 8,
            }}
          >
            <button onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))} style={miniBtn()}>
              ‹
            </button>
            <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: "var(--ink)" }}>
              {clampedPreview + 1} of {rowCount}
            </div>
            <button onClick={() => setPreviewIdx((i) => Math.min(rowCount - 1, i + 1))} style={miniBtn()}>
              ›
            </button>
          </div>
          {previewRow && (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-soft)", fontStyle: "italic", fontFamily: "Fraunces, serif" }}>
              {previewRow[columns[0]] ?? ""}
              {columns[1] ? ` · ${previewRow[columns[1]] ?? ""}` : ""}
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--bg)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: cozy ? 520 : 460,
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--line)",
              background: "var(--panel-soft)",
            }}
          >
            {[
              { key: "compose", label: "Compose", title: "Write the template with {{column}} tokens." },
              { key: "preview", label: "Preview", title: "See how one row will look with tokens filled in. Pick the row on the left." },
            ].map((t) => (
              <button
                key={t.key}
                title={t.title}
                onClick={() => setTab(t.key as "compose" | "preview")}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "12px 18px",
                  fontSize: 12.5,
                  fontFamily: "Fraunces, serif",
                  color: tab === t.key ? "var(--ink)" : "var(--ink-dim)",
                  borderBottom: "2px solid " + (tab === t.key ? "var(--terracotta)" : "transparent"),
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "compose" ? (
            <>
              <div
                style={{
                  padding: "10px 18px",
                  borderBottom: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--ink-soft)", width: 50, textTransform: "uppercase", letterSpacing: 1 }}>To</span>
                <ColumnSelect
                  label="Name"
                  value={nameColumn}
                  onChange={setNameColumn}
                  columns={columns}
                  allowNone
                />
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>&lt;</span>
                <ColumnSelect
                  label="Email"
                  value={emailColumn}
                  onChange={setEmailColumn}
                  columns={columns}
                />
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>&gt;</span>
                <span style={{ flex: 1 }} />
                {previewRow && emailColumn && (
                  <span style={{ fontSize: 11, color: "var(--ink-soft)", fontStyle: "italic", fontFamily: "Fraunces, serif" }}>
                    preview: {(nameColumn && previewRow[nameColumn]) || ""}
                    {nameColumn ? " " : ""}&lt;{previewRow[emailColumn] ?? ""}&gt;
                  </span>
                )}
              </div>
              <CcField cc={cc} setCc={setCc} />
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 11, color: "var(--ink-soft)", width: 50, textTransform: "uppercase", letterSpacing: 1 }}>Subject</span>
                <input
                  ref={subjectRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  onFocus={() => setLastFocused("subject")}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const token = e.dataTransfer.getData("text/plain");
                    if (!token) return;
                    const el = e.currentTarget;
                    const start = el.selectionStart ?? el.value.length;
                    const end = el.selectionEnd ?? el.value.length;
                    const next = el.value.slice(0, start) + token + el.value.slice(end);
                    setSubject(next);
                    requestAnimationFrame(() => {
                      el.focus();
                      const pos = start + token.length;
                      el.setSelectionRange(pos, pos);
                    });
                  }}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 14,
                    color: "var(--ink)",
                    fontFamily: "Inter, sans-serif",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--line)",
                  background: "var(--panel-soft)",
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={pickDocx}
                  disabled={docxBusy}
                  title="Import a .docx file (including inline images and signatures) as the email body"
                  style={{
                    all: "unset",
                    cursor: docxBusy ? "wait" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 11px",
                    borderRadius: 999,
                    border: "1px solid var(--line-strong)",
                    background: "var(--bg)",
                    color: "var(--ink)",
                    fontSize: 12,
                    fontWeight: 500,
                    opacity: docxBusy ? 0.6 : 1,
                  }}
                >
                  {docxBusy ? "Importing…" : "Import .docx"}
                </button>
                <span style={{ fontSize: 11, color: "var(--ink-soft)", fontStyle: "italic" }}>
                  Replaces the current body with your Word file's content.
                </span>
                <span style={{ flex: 1 }} />
                {docxNote && (
                  <span style={{ fontSize: 11.5, color: "var(--sage-dark)" }}>{docxNote}</span>
                )}
                {docxError && (
                  <span style={{ fontSize: 11.5, color: "var(--terracotta)" }}>{docxError}</span>
                )}
              </div>
              <div
                style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
                onFocusCapture={() => setLastFocused("body")}
              >
                <RichTextEditor
                  ref={editorRef}
                  value={template}
                  onChange={setTemplate}
                  minHeight={cozy ? 320 : 260}
                  placeholder="Write your letter…"
                />
              </div>
            </>
          ) : (
            <div style={{ padding: "22px 28px", flex: 1, overflow: "auto" }}>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1 }}>To</div>
              <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 4 }}>
                {nameColumn && previewRow ? previewRow[nameColumn] : ""}{nameColumn ? " " : ""}
                &lt;{emailColumn && previewRow ? previewRow[emailColumn] : ""}&gt;
              </div>
              {cc.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginTop: 12 }}>Cc</div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginTop: 4 }}>{cc.join(", ")}</div>
                </>
              )}
              <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 1, marginTop: 16 }}>Subject</div>
              <div style={{ fontSize: 15, color: "var(--ink)", marginTop: 4, fontFamily: "Fraunces, serif" }}>
                {previewRow ? resolveTokens(subject, previewRow) : subject}
              </div>
              <div style={{ margin: "22px 0 18px" }}>
                <ArchDivider width={200} />
              </div>
              <div
                className="letterpress-preview"
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 14,
                  lineHeight: 1.75,
                  color: "var(--ink)",
                }}
                dangerouslySetInnerHTML={{
                  __html: previewRow ? resolveTokensHtml(template, previewRow) : template,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </StepShell>
  );
}

export function TokenText({ text }: { text: string }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /\{\{\w+\}\}/.test(p) ? (
          <span
            key={i}
            style={{
              color: "var(--terracotta)",
              background: "rgba(169,132,103,0.12)",
              padding: "0 4px",
              borderRadius: 4,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "0.9em",
            }}
          >
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function ColumnSelect({
  label,
  value,
  onChange,
  columns,
  allowNone = false,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  columns: string[];
  allowNone?: boolean;
}) {
  return (
    <select
      title={`${label} column`}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : v);
      }}
      style={{
        height: 28,
        padding: "0 6px",
        borderRadius: 6,
        border: "1px solid var(--line)",
        background: "var(--bg)",
        color: "var(--terracotta)",
        fontSize: 12,
        fontFamily: "JetBrains Mono, monospace",
        cursor: "pointer",
        maxWidth: 180,
      }}
    >
      {allowNone && <option value="">— {label} —</option>}
      {!allowNone && value === null && (
        <option value="" disabled>
          {label}…
        </option>
      )}
      {columns.map((c) => (
        <option key={c} value={c}>
          {`{{${c}}}`}
        </option>
      ))}
    </select>
  );
}

function codeStyle(): React.CSSProperties {
  return {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: "0.9em",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    padding: "1px 5px",
    borderRadius: 4,
    color: "var(--terracotta)",
  };
}

function miniBtn(): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    width: 22,
    height: 22,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    border: "1px solid var(--line)",
    fontSize: 14,
    color: "var(--ink-dim)",
  };
}

function CcField({ cc, setCc }: { cc: string[]; setCc: React.Dispatch<React.SetStateAction<string[]>> }) {
  const [input, setInput] = React.useState("");
  const [expanded, setExpanded] = React.useState(cc.length > 0);
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\s;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = parts.filter((p) => emailRe.test(p) && !cc.includes(p));
    if (valid.length) setCc([...cc, ...valid]);
    setInput("");
  };

  if (!expanded) {
    return (
      <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, color: "var(--ink-soft)", width: 50, textTransform: "uppercase", letterSpacing: 1 }}>Cc</span>
        <button
          onClick={() => setExpanded(true)}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--terracotta)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            textDecorationColor: "rgba(169,132,103,0.4)",
          }}
        >
          + add Cc recipients
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "var(--ink-soft)", fontStyle: "italic", fontFamily: "Fraunces, serif" }}>
          same list sent with every row
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span style={{ fontSize: 11, color: "var(--ink-soft)", width: 50, textTransform: "uppercase", letterSpacing: 1, paddingTop: 6 }}>Cc</span>
      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {cc.map((e) => (
          <span
            key={e}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 4px 3px 10px",
              borderRadius: 999,
              background: "rgba(127,145,114,0.14)",
              border: "1px solid rgba(127,145,114,0.4)",
              fontSize: 11.5,
              color: "var(--sage-dark)",
            }}
          >
            {e}
            <button
              onClick={() => setCc(cc.filter((x) => x !== e))}
              style={{
                all: "unset",
                cursor: "pointer",
                width: 16,
                height: 16,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--sage-dark)",
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
              e.preventDefault();
              commit(input);
            } else if (e.key === "Backspace" && !input && cc.length) setCc(cc.slice(0, -1));
          }}
          onBlur={() => input && commit(input)}
          placeholder={cc.length ? "" : "accounts@studio.com, assistant@studio.com"}
          style={{
            flex: 1,
            minWidth: 180,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 12.5,
            color: "var(--ink)",
            padding: "4px 0",
          }}
        />
      </div>
    </div>
  );
}
