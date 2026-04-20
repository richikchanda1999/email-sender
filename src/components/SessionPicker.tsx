import React from "react";
import { SessionMeta } from "../data";
import { WindowChrome } from "./WindowChrome";
import { primaryBtn, ghostBtn } from "../primitives";

export function SessionPicker({
  sessions,
  onPick,
  onNew,
  onDelete,
  rightSlot,
}: {
  sessions: SessionMeta[];
  onPick: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  rightSlot?: React.ReactNode;
}) {
  const sorted = React.useMemo(
    () => [...sessions].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1)),
    [sessions]
  );

  const fmt = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <WindowChrome rightSlot={rightSlot}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "64px 40px",
          overflow: "auto",
          background: "var(--bg)",
        }}
      >
        <div style={{ maxWidth: 680, width: "100%" }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              color: "var(--ink-soft)",
              marginBottom: 10,
            }}
          >
            Resume or start fresh
          </div>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 32,
              color: "var(--ink)",
              lineHeight: 1.2,
            }}
          >
            Which campaign are we working on?
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-dim)", marginTop: 10, lineHeight: 1.6 }}>
            Letterpress auto-saves your progress into named sessions. Pick one below to resume,
            or start a new campaign.
          </div>

          <div style={{ marginTop: 28 }}>
            <button onClick={onNew} style={primaryBtn()}>
              + New campaign
            </button>
          </div>

          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 18px",
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "Fraunces, serif",
                      fontSize: 16,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name || "Untitled campaign"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                    Last updated {fmt(s.updatedAt)}
                  </div>
                </div>
                <button onClick={() => onPick(s.id)} style={primaryBtn()}>
                  Resume
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Move "${s.name}" to trash?`)) onDelete(s.id);
                  }}
                  style={{ ...ghostBtn(), color: "var(--terracotta)" }}
                  title="Move to trash"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          {sorted.length === 0 && (
            <div
              style={{
                marginTop: 28,
                padding: "20px 24px",
                background: "var(--panel-soft)",
                border: "1px dashed var(--line-strong)",
                borderRadius: 10,
                color: "var(--ink-dim)",
                fontSize: 13,
              }}
            >
              No saved sessions yet. Start a new campaign above.
            </div>
          )}
        </div>
      </div>
    </WindowChrome>
  );
}
