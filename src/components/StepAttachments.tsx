import React from "react";
import { Sheet, Rules, FixedFile, ResolvedAttachment, UnmatchedFile, rowRecord } from "../data";
import { StepShell, Pill, ghostBtn, linkBtn } from "../primitives";
import { IconFolder, IconPlus, IconX, IconCheck } from "../icons";
import { open } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc";

export function StepAttachments({
  sheet,
  rules,
  setRules,
  folder,
  setFolder,
  resolved,
  setResolved,
  fixed,
  setFixed,
  density,
}: {
  sheet: Sheet | null;
  rules: Rules;
  setRules: React.Dispatch<React.SetStateAction<Rules>>;
  folder: string | null;
  setFolder: React.Dispatch<React.SetStateAction<string | null>>;
  resolved: ResolvedAttachment[];
  setResolved: React.Dispatch<React.SetStateAction<ResolvedAttachment[]>>;
  fixed: FixedFile[];
  setFixed: React.Dispatch<React.SetStateAction<FixedFile[]>>;
  density: "cozy" | "compact";
}) {
  const cozy = density === "cozy";
  const [error, setError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [showMissingOnly, setShowMissingOnly] = React.useState(false);
  const [unmatched, setUnmatched] = React.useState<UnmatchedFile[]>([]);
  const patternInputRef = React.useRef<HTMLInputElement | null>(null);

  const insertTokenAtCursor = (k: string) => {
    const token = `{{${k}}}`;
    const el = patternInputRef.current;
    if (!el) {
      setRules((r) => ({ ...r, pattern: r.pattern + token }));
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    setRules((r) => ({ ...r, pattern: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const rows = React.useMemo(
    () => (sheet ? sheet.rows.map((_, i) => rowRecord(sheet, i)) : []),
    [sheet]
  );

  const colTokens = sheet?.columns ?? [];

  const pickFolder = async () => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (!picked) return;
      const path = typeof picked === "string" ? picked : (picked as any).path ?? String(picked);
      setFolder(path);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? "failed to pick folder");
    }
  };

  const pickFixed = async () => {
    try {
      const picked = await open({ multiple: true });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const entries: FixedFile[] = paths.map((p: any) => {
        const path = typeof p === "string" ? p : p?.path ?? String(p);
        const name = path.split(/[\\/]/).pop() ?? path;
        return { name, path };
      });
      setFixed((fx) => [
        ...fx,
        ...entries.filter((e) => !fx.some((existing) => existing.path === e.path)),
      ]);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? "failed to pick files");
    }
  };

  // Debounced auto-match
  React.useEffect(() => {
    if (!folder || !sheet || rows.length === 0 || !rules.pattern) {
      setResolved([]);
      setUnmatched([]);
      return;
    }
    const id = setTimeout(async () => {
      setRunning(true);
      setError(null);
      try {
        const r = await ipc.resolveAttachments({
          folder,
          pattern: rules.pattern,
          rows,
          caseInsensitive: rules.caseInsensitive,
          fuzzy: rules.fuzzy,
        });
        setResolved(r.rows);
        setUnmatched(r.unmatchedFiles);
      } catch (e: any) {
        setError(typeof e === "string" ? e : e?.message ?? "matching failed");
        setResolved([]);
        setUnmatched([]);
      } finally {
        setRunning(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [folder, sheet, rows, rules.pattern, rules.caseInsensitive, rules.fuzzy, setResolved]);

  const matchCount = resolved.filter((r) => r.matchedPath).length;
  const total = rows.length;

  return (
    <StepShell title="Attach the right files" sub="One set follows each row; another set ships with every email." density={density} wide>
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
        <div style={{ color: "var(--ink)", fontWeight: 500, marginBottom: 6 }}>Two kinds of attachments</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div>
            <strong>Per-row</strong> — one file per row, looked up in a folder by filename pattern.
            Example: if your sheet has a column <code style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--terracotta)" }}>InvoiceNumber</code>, the pattern{" "}
            <code style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--terracotta)" }}>{"{{InvoiceNumber}}.pdf"}</code> attaches <code style={{ fontFamily: "JetBrains Mono, monospace" }}>INV-0042.pdf</code> to the row with that invoice number.
          </div>
          <div>
            <strong>Fixed</strong> — same file(s) attached to every email. Good for a terms-of-service PDF, a letterhead, or a bank-details sheet.
          </div>
        </div>
      </div>
      <SectionCard title="Per-row attachment" num="A">
        <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 14 }}>
          For each row, find a file inside a folder whose name matches the pattern below. Placeholders are replaced with the row's values before matching.
        </div>

        <Row label="Source folder">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              flex: 1,
            }}
          >
            <IconFolder size={14} stroke="var(--sage)" />
            <span
              style={{
                fontSize: 12.5,
                color: folder ? "var(--ink)" : "var(--ink-soft)",
                fontFamily: "JetBrains Mono, monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
              title={folder ?? ""}
            >
              {folder ?? "No folder selected"}
            </span>
            <button onClick={pickFolder} style={linkBtn()}>
              {folder ? "Change" : "Choose"}
            </button>
          </div>
        </Row>

        <Row label="Filename pattern">
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              ref={patternInputRef}
              value={rules.pattern}
              onChange={(e) => setRules((r) => ({ ...r, pattern: e.target.value }))}
              placeholder="{{ColumnName}}.pdf"
              spellCheck={false}
              style={{
                padding: "10px 14px",
                background: "var(--bg)",
                border: "1px solid var(--line-strong)",
                borderRadius: 8,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 12.5,
                color: "var(--ink)",
                outline: "none",
                width: "100%",
              }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {colTokens.map((k) => (
                <button key={k} onClick={() => insertTokenAtCursor(k)} style={tokenChip()}>
                  <IconPlus size={10} />
                  {`{{${k}}}`}
                </button>
              ))}
              <button onClick={() => setRules((r) => ({ ...r, pattern: "" }))} style={{ ...tokenChip(), color: "var(--ink-soft)" }}>
                clear
              </button>
            </div>
          </div>
        </Row>

        <Row label="Matching">
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <Toggle checked={rules.caseInsensitive} onChange={(v) => setRules((r) => ({ ...r, caseInsensitive: v }))} label="Case-insensitive" />
            <Toggle checked={rules.fuzzy} onChange={(v) => setRules((r) => ({ ...r, fuzzy: v }))} label="Ignore spaces & dashes" />
            <Toggle checked={rules.required} onChange={(v) => setRules((r) => ({ ...r, required: v }))} label="Skip row if missing" />
          </div>
        </Row>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(196,98,63,0.08)",
              border: "1px solid rgba(196,98,63,0.35)",
              color: "var(--terracotta)",
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, borderTop: "1px dashed var(--line-strong)", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)" }}>
              Match preview · {running ? "matching…" : total > 0 ? `${matchCount} of ${total} matched` : "load a sheet first"}
            </div>
            <span style={{ flex: 1 }} />
            {folder && total > 0 && (
              <button
                onClick={() => setShowMissingOnly((v) => !v)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontSize: 11,
                  color: showMissingOnly ? "var(--terracotta)" : "var(--ink-soft)",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                {showMissingOnly ? "Show all" : `Show missing only (${total - matchCount})`}
              </button>
            )}
          </div>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--bg)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 1fr) minmax(200px, 2fr) 110px",
                fontSize: 11,
                color: "var(--ink-soft)",
                textTransform: "uppercase",
                letterSpacing: 1,
                padding: "8px 12px",
                borderBottom: "1px solid var(--line)",
                background: "var(--panel-soft)",
              }}
            >
              <div>Row</div>
              <div>Resolved filename</div>
              <div>Status</div>
            </div>
            <div style={{ maxHeight: cozy ? 320 : 260, overflow: "auto" }}>
              {rows
                .map((r, i) => ({ r, i }))
                .filter(({ i }) => {
                  if (!showMissingOnly) return true;
                  const res = resolved[i];
                  return !res?.matchedPath;
                })
                .map(({ r, i }, displayIdx, arr) => {
                  const res = resolved[i];
                  const name = res?.resolvedName ?? "";
                  const ok = !!res?.matchedPath;
                  const labelCol = colTokens[0] ?? "";
                  return (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(140px, 1fr) minmax(200px, 2fr) 110px",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderBottom: displayIdx === arr.length - 1 ? "none" : "1px solid var(--line)",
                        fontSize: 12.5,
                        background: displayIdx % 2 ? "var(--panel-soft)" : "transparent",
                      }}
                    >
                      <div style={{ color: "var(--ink)", display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ color: "var(--ink-soft)", fontFamily: "JetBrains Mono, monospace", fontSize: 10.5 }}>
                          {i + 1}
                        </span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r[labelCol] ?? `Row ${i + 1}`}
                        </span>
                      </div>
                      <div
                        title={name}
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          color: "var(--ink-dim)",
                          fontSize: 11.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {name || "—"}
                      </div>
                      <div>
                        {!folder ? (
                          <Pill>no folder</Pill>
                        ) : ok ? (
                          <Pill tone="sage">
                            <IconCheck size={10} />
                            found
                          </Pill>
                        ) : (
                          <Pill tone="terra">
                            <IconX size={10} />
                            missing
                          </Pill>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {folder && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)" }}>
                Files in folder that didn't match · {unmatched.length}
              </div>
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 10,
                overflow: "hidden",
                background: "var(--bg)",
              }}
            >
              {unmatched.length === 0 ? (
                <div
                  style={{
                    padding: "14px 16px",
                    fontSize: 12.5,
                    color: "var(--ink-soft)",
                    fontStyle: "italic",
                  }}
                >
                  Every file in the folder matched a row.
                </div>
              ) : (
                <div style={{ maxHeight: cozy ? 320 : 260, overflow: "auto" }}>
                  {unmatched.map((f, displayIdx) => (
                    <div
                      key={f.path}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(200px, 1.2fr) minmax(200px, 2fr)",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderBottom:
                          displayIdx === unmatched.length - 1 ? "none" : "1px solid var(--line)",
                        fontSize: 12.5,
                        background: displayIdx % 2 ? "var(--panel-soft)" : "transparent",
                      }}
                    >
                      <div
                        title={f.name}
                        style={{
                          color: "var(--ink)",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 11.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.name}
                      </div>
                      <div
                        title={f.path}
                        style={{
                          color: "var(--ink-soft)",
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 10.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.path}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Fixed attachments" num="B" sub="Sent with every email in this campaign.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {fixed.map((f) => {
            const ext = (f.name.split(".").pop() ?? "").toLowerCase();
            const isPdf = ext === "pdf";
            return (
              <div
                key={f.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 36,
                    borderRadius: 3,
                    background: isPdf ? "rgba(169,132,103,0.18)" : "rgba(127,145,114,0.18)",
                    border: "1px solid var(--line-strong)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    letterSpacing: 0.5,
                    color: isPdf ? "var(--terracotta)" : "var(--sage-dark)",
                    fontWeight: 600,
                  }}
                >
                  {(ext || "file").toUpperCase()}
                </div>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.path}>
                    {f.path}
                  </div>
                </div>
                <button onClick={() => setFixed((fx) => fx.filter((x) => x.path !== f.path))} style={{ ...ghostBtn(), padding: "6px 10px" }}>
                  <IconX size={11} />
                </button>
              </div>
            );
          })}
          <button
            onClick={pickFixed}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "12px 14px",
              border: "1.5px dashed var(--line-strong)",
              borderRadius: 8,
              fontSize: 12.5,
              color: "var(--ink-dim)",
            }}
          >
            <IconPlus size={12} /> Add a file
          </button>
        </div>
      </SectionCard>
    </StepShell>
  );
}

export function SectionCard({ title, sub, num, children }: { title: string; sub?: string; num: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 22,
        padding: "22px 26px",
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: sub ? 4 : 18 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontStyle: "italic",
            fontSize: 14,
            color: "var(--terracotta)",
          }}
        >
          {num}.
        </div>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 19,
            color: "var(--ink)",
            letterSpacing: -0.2,
          }}
        >
          {title}
        </div>
      </div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 16, paddingLeft: 22 }}>{sub}</div>}
      <div style={{ paddingLeft: 22 }}>{children}</div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
      <div
        style={{
          width: 130,
          flexShrink: 0,
          paddingTop: 10,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
          color: "var(--ink-dim)",
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, display: "flex" }}>{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 30,
          height: 18,
          borderRadius: 9,
          background: checked ? "var(--terracotta)" : "var(--line-strong)",
          position: "relative",
          transition: "background 140ms",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 14 : 2,
            width: 14,
            height: 14,
            borderRadius: 7,
            background: "#fff",
            transition: "left 140ms",
          }}
        />
      </div>
      <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{label}</span>
    </label>
  );
}

function tokenChip(): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 999,
    background: "var(--panel)",
    border: "1px solid var(--line-strong)",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
    color: "var(--terracotta)",
  };
}
