import React from "react";
import { Sheet } from "../data";
import { StepShell, Pill, primaryBtn, ghostBtn } from "../primitives";
import { ArchDivider } from "./WindowChrome";
import { IconSheet } from "../icons";
import { open } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc";

export function StepSheet({
  sheet,
  setSheet,
  density,
}: {
  sheet: Sheet | null;
  setSheet: React.Dispatch<React.SetStateAction<Sheet | null>>;
  density: "cozy" | "compact";
}) {
  const cozy = density === "cozy";
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Spreadsheets", extensions: ["xlsx", "xls", "csv"] }],
      });
      if (!picked) return;
      const path = typeof picked === "string" ? picked : (picked as any).path ?? String(picked);
      setLoading(true);
      const result = await ipc.loadSpreadsheet(path);
      setSheet(result);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? "failed to load spreadsheet");
    } finally {
      setLoading(false);
    }
  };

  if (!sheet) {
    return (
      <StepShell title="Choose a spreadsheet" sub="Point at an .xlsx or .csv to start your campaign." density={density}>
        <div
          style={{
            marginTop: 24,
            border: "1.5px dashed var(--line-strong)",
            borderRadius: 14,
            padding: cozy ? "56px 40px" : "44px 32px",
            background: "var(--panel)",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <ArchDivider width={120} />
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 400, color: "var(--ink)" }}>
            {loading ? "Reading…" : "Drop a sheet here"}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", maxWidth: 380, lineHeight: 1.6 }}>
            Each row becomes one email. Column names will appear as placeholders you can drop into your template.
          </div>
          <button onClick={pick} disabled={loading} style={primaryBtn()}>
            <IconSheet size={15} /> Browse files
          </button>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>Accepts .xlsx · .xls · .csv</div>
          {error && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(196,98,63,0.08)",
                border: "1px solid rgba(196,98,63,0.35)",
                color: "var(--terracotta)",
                fontSize: 12.5,
                maxWidth: 480,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </StepShell>
    );
  }

  const fileLabel = sheet.path.split(/[\\/]/).pop() ?? sheet.path;
  const multipleSheets = sheet.availableSheets.length > 1;

  const switchSheet = async (name: string) => {
    if (name === sheet.sheetName) return;
    setError(null);
    setLoading(true);
    try {
      const result = await ipc.loadSpreadsheet(sheet.path, name);
      setSheet(result);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e?.message ?? "failed to switch sheet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StepShell title={fileLabel} sub={`${sheet.sheetName} · ${sheet.rows.length} rows · ${sheet.columns.length} columns`} density={density}>
      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Pill tone="sage">Parsed cleanly</Pill>
        <Pill>Header row detected</Pill>
        {multipleSheets && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)" }}>Sheet</span>
            <select
              value={sheet.sheetName}
              disabled={loading}
              onChange={(e) => void switchSheet(e.target.value)}
              style={{
                height: 28,
                padding: "0 8px",
                borderRadius: 6,
                border: "1px solid var(--line-strong)",
                background: "var(--bg)",
                color: "var(--ink)",
                fontSize: 12.5,
                cursor: loading ? "wait" : "pointer",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {sheet.availableSheets.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={pick} style={ghostBtn()}>Change file</button>
      </div>
      {error && (
        <div
          style={{
            marginTop: 10,
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

      <div
        style={{
          marginTop: 20,
          border: "1px solid var(--line)",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        <div style={{ maxHeight: cozy ? 420 : 360, overflow: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `40px repeat(${sheet.columns.length}, minmax(140px, 1fr))`,
              background: "var(--panel)",
              borderBottom: "1px solid var(--line)",
              position: "sticky",
              top: 0,
              zIndex: 1,
            }}
          >
            <HeaderCell />
            {sheet.columns.map((c) => (
              <HeaderCell key={c}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: "var(--terracotta)", opacity: 0.7 }} />
                  {c}
                </div>
              </HeaderCell>
            ))}
          </div>
          {sheet.rows.map((r, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: `40px repeat(${sheet.columns.length}, minmax(140px, 1fr))`,
                borderBottom: i === sheet.rows.length - 1 ? "none" : "1px solid var(--line)",
                background: i % 2 ? "var(--panel-soft)" : "var(--bg)",
              }}
            >
              <Cell muted>{i + 1}</Cell>
              {sheet.columns.map((_, ci) => (
                <Cell key={ci}>{r[ci] ?? ""}</Cell>
              ))}
            </div>
          ))}
        </div>
      </div>
    </StepShell>
  );
}

function HeaderCell({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        color: "var(--ink-dim)",
        fontWeight: 500,
        borderRight: "1px solid var(--line)",
      }}
    >
      {children}
    </div>
  );
}

function Cell({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        fontSize: 12.5,
        color: muted ? "var(--ink-soft)" : "var(--ink)",
        borderRight: "1px solid var(--line)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontFamily: muted ? "JetBrains Mono, monospace" : "Inter, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
