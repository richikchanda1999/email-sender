import React from "react";
import { WindowChrome } from "./WindowChrome";
import { primaryBtn, ghostBtn } from "../primitives";
import { openPath } from "@tauri-apps/plugin-opener";

export function SetupScreen({ configPath, onRetry }: { configPath: string; onRetry: () => void }) {
  const parentDir = configPath.replace(/[\\/]letterpress\.toml$/, "");

  const revealInFinder = async () => {
    try {
      await openPath(parentDir);
    } catch (e) {
      console.error("reveal:", e);
    }
  };

  return (
    <WindowChrome>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          padding: "48px 64px",
          overflow: "auto",
          background: "var(--bg)",
        }}
      >
        <div style={{ maxWidth: 720, width: "100%" }}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.2,
              color: "var(--terracotta)",
              marginBottom: 12,
            }}
          >
            Setup required
          </div>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: 30, color: "var(--ink)", lineHeight: 1.2 }}>
            Add your Google OAuth credentials
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-dim)", marginTop: 12, lineHeight: 1.65 }}>
            Letterpress uses the Gmail API to send mail on your behalf. You need to create an OAuth 2.0
            desktop client once in Google Cloud Console and drop the credentials into a config file.
          </div>

          <ol
            style={{
              marginTop: 28,
              paddingLeft: 20,
              fontSize: 13.5,
              color: "var(--ink)",
              lineHeight: 1.8,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <li>
              Visit{" "}
              <Link href="https://console.cloud.google.com/">console.cloud.google.com</Link> and create or
              select a project called "Letterpress".
            </li>
            <li>
              Enable the Gmail API:{" "}
              <Link href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">
                APIs & Services → Library → Gmail API → Enable
              </Link>
              .
            </li>
            <li>
              Configure the OAuth consent screen (External, Testing mode). Add scopes{" "}
              <Code>gmail.send</Code>, <Code>gmail.readonly</Code>, <Code>userinfo.email</Code>,{" "}
              <Code>userinfo.profile</Code>. Add your own Gmail as a test user. (The{" "}
              <Code>gmail.readonly</Code> scope is used by the duplicate-check feature to scan your
              Sent folder.)
            </li>
            <li>
              Create credentials:{" "}
              <Link href="https://console.cloud.google.com/apis/credentials">
                APIs & Services → Credentials → Create → OAuth client ID → Desktop app
              </Link>
              . Copy the client ID and secret.
            </li>
            <li>
              Save a file <Code>letterpress.toml</Code> at the path below with this content:
            </li>
          </ol>

          <pre
            style={{
              marginTop: 12,
              padding: "16px 18px",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 12.5,
              fontFamily: "JetBrains Mono, monospace",
              color: "var(--ink)",
              overflow: "auto",
            }}
          >{`[google_oauth]
client_id     = "xxxxxxxx.apps.googleusercontent.com"
client_secret = "GOCSPX-xxxxxxxxxxxxxxxxxxxx"`}</pre>

          <div
            style={{
              marginTop: 18,
              padding: "14px 16px",
              background: "var(--panel-soft)",
              border: "1px dashed var(--line-strong)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--ink-dim)", flex: 1, fontFamily: "JetBrains Mono, monospace", wordBreak: "break-all" }}>
              {configPath}
            </div>
            <button onClick={revealInFinder} style={ghostBtn()}>
              Reveal folder
            </button>
          </div>

          <div style={{ marginTop: 26, display: "flex", gap: 10 }}>
            <button onClick={onRetry} style={primaryBtn()}>
              I've saved the file — continue
            </button>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "0.88em",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        padding: "1px 6px",
        borderRadius: 4,
        color: "var(--terracotta)",
      }}
    >
      {children}
    </code>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  const click = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(href);
    } catch (err) {
      console.error(err);
    }
  };
  return (
    <a
      href={href}
      onClick={click}
      style={{
        color: "var(--terracotta)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      {children}
    </a>
  );
}
