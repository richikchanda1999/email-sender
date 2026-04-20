import React from "react";
import { SessionMeta } from "../data";

export function SessionMenu({
  activeId,
  activeName,
  sessions,
  onRename,
  onSwitch,
  onNew,
  onDelete,
}: {
  activeId: string | null;
  activeName: string;
  sessions: SessionMeta[];
  onRename: (name: string) => void;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState(activeName);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRenaming(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const others = sessions.filter((s) => s.id !== activeId);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== activeName) onRename(trimmed);
    setRenaming(false);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", marginRight: 8 }}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setDraftName(activeName);
        }}
        title="Session: click for options"
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(169,132,103,0.10)",
          border: "1px solid rgba(169,132,103,0.35)",
          color: "var(--terracotta)",
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0.2,
          maxWidth: 240,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 200,
          }}
        >
          {activeName || "Untitled campaign"}
        </span>
        <span style={{ opacity: 0.7, fontSize: 9 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 260,
            maxWidth: 320,
            background: "var(--bg)",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(59,50,43,0.18)",
            zIndex: 20,
            padding: 6,
            fontSize: 12.5,
            color: "var(--ink)",
          }}
        >
          {renaming ? (
            <div style={{ padding: "8px 10px" }}>
              <div
                style={{
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: "var(--ink-soft)",
                  marginBottom: 6,
                }}
              >
                Rename
              </div>
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") {
                    setRenaming(false);
                    setDraftName(activeName);
                  }
                }}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 6,
                  background: "var(--panel-soft)",
                  fontSize: 12.5,
                  outline: "none",
                  color: "var(--ink)",
                }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setRenaming(false); setDraftName(activeName); }} style={menuBtn()}>
                  Cancel
                </button>
                <button onClick={commitRename} style={{ ...menuBtn(), color: "var(--terracotta)" }}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <MenuItem
                onClick={() => {
                  setRenaming(true);
                }}
              >
                Rename this session
              </MenuItem>
              <MenuItem onClick={() => { setOpen(false); onNew(); }}>New campaign</MenuItem>
              {others.length > 0 && (
                <>
                  <Divider />
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      color: "var(--ink-soft)",
                      padding: "6px 10px",
                    }}
                  >
                    Switch to
                  </div>
                  {others.slice(0, 8).map((s) => (
                    <MenuItem key={s.id} onClick={() => { setOpen(false); onSwitch(s.id); }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {s.name || "Untitled"}
                      </span>
                    </MenuItem>
                  ))}
                </>
              )}
              <Divider />
              <MenuItem
                onClick={() => {
                  if (confirm(`Move "${activeName}" to trash?`)) {
                    setOpen(false);
                    onDelete();
                  }
                }}
                tone="terra"
              >
                Delete this session
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "terra";
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        width: "100%",
        padding: "7px 10px",
        borderRadius: 6,
        fontSize: 12.5,
        color: tone === "terra" ? "var(--terracotta)" : "var(--ink)",
        background: hover ? "rgba(59,50,43,0.05)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />;
}

function menuBtn(): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    color: "var(--ink)",
    border: "1px solid var(--line-strong)",
  };
}
