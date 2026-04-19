import React from "react";

export type RichEditorHandle = {
  insertToken: (key: string) => void;
  focus: () => void;
  reset: (html: string) => void;
};

const FONT_FAMILIES = [
  { label: "Sans Serif", value: "Inter, system-ui, sans-serif" },
  { label: "Serif", value: "Fraunces, 'Times New Roman', serif" },
  { label: "Monospace", value: "'JetBrains Mono', monospace" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Courier", value: "'Courier New', monospace" },
];

const FONT_SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "7" },
];

const TEXT_COLORS = [
  "#3B322B",
  "#A98467",
  "#C4623F",
  "#7F9172",
  "#4F5F43",
  "#2E6F95",
  "#8B1E3F",
  "#6B4E71",
];

const HIGHLIGHTS = ["transparent", "#F2E9D8", "#FDF6C5", "#C7E8CA", "#FCD5CE", "#D9E4F5"];

export const RichTextEditor = React.forwardRef<
  RichEditorHandle,
  {
    value: string;
    onChange: (html: string) => void;
    minHeight?: number;
    placeholder?: string;
  }
>(function RichTextEditor({ value, onChange, minHeight = 260, placeholder }, ref) {
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const seededRef = React.useRef(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const savedRangeRef = React.useRef<Range | null>(null);

  React.useLayoutEffect(() => {
    if (!seededRef.current && editorRef.current) {
      editorRef.current.innerHTML = value || "";
      seededRef.current = true;
    }
  }, [value]);

  // If caller resets value to something wildly different (e.g. resetAll), re-seed.
  React.useEffect(() => {
    if (!editorRef.current) return;
    if (!seededRef.current) return;
    const current = editorRef.current.innerHTML;
    if (current !== value && document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const emit = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const focus = () => {
    editorRef.current?.focus();
  };

  const exec = (cmd: string, arg?: string) => {
    focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const insertHtml = (html: string) => {
    focus();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  React.useImperativeHandle(ref, () => ({
    insertToken: (k: string) => insertHtml(`{{${k}}}`),
    focus,
    reset: (html: string) => {
      if (editorRef.current) {
        editorRef.current.innerHTML = html;
      }
      onChange(html);
    },
  }));

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = savedRangeRef.current;
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const applyLink = () => {
    if (!linkUrl) {
      setLinkOpen(false);
      return;
    }
    let href = linkUrl.trim();
    if (!/^[a-z]+:\/\//i.test(href) && !href.startsWith("mailto:")) {
      href = "https://" + href;
    }
    restoreSelection();
    document.execCommand("createLink", false, href);
    emit();
    setLinkOpen(false);
    setLinkUrl("");
  };

  const openLinkPrompt = () => {
    saveSelection();
    setLinkUrl("");
    setLinkOpen(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Toolbar
        exec={exec}
        onLink={openLinkPrompt}
      />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onKeyDown={(e) => {
          // Let browser handle most things, but intercept Tab to insert spaces
          if (e.key === "Tab") {
            e.preventDefault();
            document.execCommand("insertText", false, "  ");
          }
        }}
        data-placeholder={placeholder ?? ""}
        style={{
          flex: 1,
          minHeight,
          padding: "18px 22px",
          outline: "none",
          fontFamily: "Inter, sans-serif",
          fontSize: 14,
          lineHeight: 1.7,
          color: "var(--ink)",
          background: "transparent",
          overflowY: "auto",
        }}
      />
      {linkOpen && (
        <LinkPrompt
          url={linkUrl}
          setUrl={setLinkUrl}
          onCancel={() => setLinkOpen(false)}
          onApply={applyLink}
        />
      )}
      <style>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--ink-soft);
          pointer-events: none;
        }
        [contenteditable] a {
          color: var(--terracotta);
          text-decoration: underline;
        }
        [contenteditable] blockquote {
          border-left: 3px solid var(--line-strong);
          padding-left: 12px;
          margin: 8px 0;
          color: var(--ink-dim);
        }
        [contenteditable] ul, [contenteditable] ol {
          padding-left: 24px;
          margin: 6px 0;
        }
      `}</style>
    </div>
  );
});

function Toolbar({
  exec,
  onLink,
}: {
  exec: (cmd: string, arg?: string) => void;
  onLink: () => void;
}) {
  // Use onMouseDown + preventDefault so the editor keeps selection focus when clicking toolbar buttons.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const [colorOpen, setColorOpen] = React.useState(false);
  const [hiOpen, setHiOpen] = React.useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 2,
        padding: "6px 8px",
        borderBottom: "1px solid var(--line)",
        background: "var(--panel-soft)",
        position: "relative",
      }}
      onMouseDown={keepFocus}
    >
      <ToolbarSelect
        title="Font family"
        onChange={(v) => exec("fontName", v)}
        options={FONT_FAMILIES}
        placeholder="Font"
        width={130}
      />
      <ToolbarSelect
        title="Font size"
        onChange={(v) => exec("fontSize", v)}
        options={FONT_SIZES}
        placeholder="Size"
        width={80}
      />
      <Divider />
      <IconBtn title="Bold (⌘B)" onClick={() => exec("bold")}>
        <span style={{ fontWeight: 700 }}>B</span>
      </IconBtn>
      <IconBtn title="Italic (⌘I)" onClick={() => exec("italic")}>
        <span style={{ fontStyle: "italic" }}>I</span>
      </IconBtn>
      <IconBtn title="Underline (⌘U)" onClick={() => exec("underline")}>
        <span style={{ textDecoration: "underline" }}>U</span>
      </IconBtn>
      <IconBtn title="Strikethrough" onClick={() => exec("strikeThrough")}>
        <span style={{ textDecoration: "line-through" }}>S</span>
      </IconBtn>
      <Divider />
      <ColorPopButton
        title="Text color"
        open={colorOpen}
        setOpen={setColorOpen}
        colors={TEXT_COLORS}
        onPick={(c) => {
          exec("foreColor", c);
          setColorOpen(false);
        }}
        label="A"
      />
      <ColorPopButton
        title="Highlight"
        open={hiOpen}
        setOpen={setHiOpen}
        colors={HIGHLIGHTS}
        onPick={(c) => {
          exec("hiliteColor", c === "transparent" ? "transparent" : c);
          setHiOpen(false);
        }}
        label="🖍"
      />
      <Divider />
      <IconBtn title="Bulleted list" onClick={() => exec("insertUnorderedList")}>
        •
      </IconBtn>
      <IconBtn title="Numbered list" onClick={() => exec("insertOrderedList")}>
        1.
      </IconBtn>
      <IconBtn title="Blockquote" onClick={() => exec("formatBlock", "blockquote")}>
        ❝
      </IconBtn>
      <IconBtn title="Indent" onClick={() => exec("indent")}>
        →
      </IconBtn>
      <IconBtn title="Outdent" onClick={() => exec("outdent")}>
        ←
      </IconBtn>
      <Divider />
      <IconBtn title="Align left" onClick={() => exec("justifyLeft")}>
        ⇤
      </IconBtn>
      <IconBtn title="Align center" onClick={() => exec("justifyCenter")}>
        ☰
      </IconBtn>
      <IconBtn title="Align right" onClick={() => exec("justifyRight")}>
        ⇥
      </IconBtn>
      <Divider />
      <IconBtn title="Insert link" onClick={onLink}>
        🔗
      </IconBtn>
      <IconBtn title="Remove formatting" onClick={() => exec("removeFormat")}>
        ⌫
      </IconBtn>
      <Divider />
      <IconBtn title="Undo" onClick={() => exec("undo")}>
        ↶
      </IconBtn>
      <IconBtn title="Redo" onClick={() => exec("redo")}>
        ↷
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        all: "unset",
        cursor: "pointer",
        width: 28,
        height: 28,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        color: "var(--ink)",
        userSelect: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,50,43,0.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: "var(--line-strong)", margin: "0 4px" }} />;
}

function ToolbarSelect({
  onChange,
  options,
  placeholder,
  title,
  width,
}: {
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
  title: string;
  width: number;
}) {
  return (
    <select
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onChange={(e) => {
        const v = e.target.value;
        if (v) onChange(v);
        e.target.value = "";
      }}
      defaultValue=""
      style={{
        width,
        height: 26,
        borderRadius: 6,
        border: "1px solid var(--line)",
        background: "var(--bg)",
        color: "var(--ink)",
        fontSize: 12,
        padding: "0 6px",
        margin: "0 2px",
        cursor: "pointer",
      }}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ColorPopButton({
  open,
  setOpen,
  colors,
  onPick,
  label,
  title,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  colors: string[];
  onPick: (c: string) => void;
  label: string;
  title: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        title={title}
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen(!open);
        }}
        style={{
          all: "unset",
          cursor: "pointer",
          width: 28,
          height: 28,
          borderRadius: 6,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          color: "var(--ink)",
          userSelect: "none",
        }}
      >
        {label}
      </button>
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            top: 32,
            left: 0,
            padding: 6,
            background: "var(--bg)",
            border: "1px solid var(--line-strong)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(59,50,43,0.18)",
            display: "grid",
            gridTemplateColumns: "repeat(4, 22px)",
            gap: 4,
            zIndex: 10,
          }}
        >
          {colors.map((c) => (
            <button
              key={c}
              title={c}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(c);
              }}
              style={{
                all: "unset",
                cursor: "pointer",
                width: 22,
                height: 22,
                borderRadius: 4,
                background:
                  c === "transparent"
                    ? "linear-gradient(45deg, transparent 45%, red 45%, red 55%, transparent 55%)"
                    : c,
                border: "1px solid var(--line-strong)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinkPrompt({
  url,
  setUrl,
  onCancel,
  onApply,
}: {
  url: string;
  setUrl: (v: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderTop: "1px solid var(--line)",
        background: "var(--panel)",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-dim)" }}>
        Link
      </span>
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onApply();
          else if (e.key === "Escape") onCancel();
        }}
        placeholder="https://…"
        style={{
          flex: 1,
          border: "1px solid var(--line)",
          background: "var(--bg)",
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 12.5,
          outline: "none",
          color: "var(--ink)",
        }}
      />
      <button
        type="button"
        onClick={onApply}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "6px 12px",
          borderRadius: 999,
          background: "var(--terracotta)",
          color: "#FBF5EA",
          fontSize: 12,
        }}
      >
        Apply
      </button>
      <button
        type="button"
        onClick={onCancel}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "6px 12px",
          borderRadius: 999,
          border: "1px solid var(--line-strong)",
          color: "var(--ink)",
          fontSize: 12,
        }}
      >
        Cancel
      </button>
    </div>
  );
}
