import React from "react";

export function WindowChrome({ title = "Letterpress", children }: { title?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          background: "var(--chrome)",
          borderBottom: "1px solid var(--line)",
          fontFamily: "Fraunces, serif",
          fontSize: 13,
          letterSpacing: 0.2,
          color: "var(--ink-dim)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <LogoMark />
          <span style={{ fontWeight: 500 }}>{title}</span>
          <span style={{ opacity: 0.4, margin: "0 6px" }}>·</span>
          <span style={{ fontSize: 12, fontFamily: "Inter, sans-serif", opacity: 0.7 }}>Untitled campaign</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 20 V10 C4 6 7 4 12 4 C17 4 20 6 20 10 V20" stroke="var(--terracotta)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 20 H20" stroke="var(--terracotta)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.6" fill="var(--terracotta)" />
    </svg>
  );
}

export function ArchDivider({ width = 200 }: { width?: number }) {
  return (
    <svg width={width} height="16" viewBox={`0 0 ${width} 16`} style={{ display: "block" }}>
      <path d={`M0 14 Q${width / 4} 2 ${width / 2} 8 T${width} 14`} stroke="var(--terracotta)" strokeOpacity="0.35" strokeWidth="1" fill="none" />
      <circle cx={width / 2} cy="8" r="1.5" fill="var(--terracotta)" fillOpacity="0.5" />
    </svg>
  );
}
