import React from "react";

export type RichEditorHandle = {
  insertToken: (key: string) => void;
  focus: () => void;
  reset: (html: string) => void;
};

type FontOption = { label: string; value: string };

// Curated cross-platform font list used when the Local Font Access API is
// unavailable. Grouped by category; the UI renders the groups via <optgroup>.
const CURATED_FONTS: { group: string; fonts: FontOption[] }[] = [
  {
    group: "App",
    fonts: [
      { label: "Sans Serif (Inter)", value: "Inter, system-ui, sans-serif" },
      { label: "Serif (Fraunces)", value: "Fraunces, 'Times New Roman', serif" },
      { label: "Monospace (JetBrains Mono)", value: "'JetBrains Mono', monospace" },
    ],
  },
  {
    group: "Sans-serif",
    fonts: [
      { label: "Arial", value: "Arial, sans-serif" },
      { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
      { label: "Helvetica Neue", value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
      { label: "Verdana", value: "Verdana, sans-serif" },
      { label: "Tahoma", value: "Tahoma, sans-serif" },
      { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
      { label: "Segoe UI", value: "'Segoe UI', Tahoma, sans-serif" },
      { label: "Calibri", value: "Calibri, sans-serif" },
      { label: "Gill Sans", value: "'Gill Sans', sans-serif" },
      { label: "Futura", value: "Futura, sans-serif" },
      { label: "Avenir", value: "Avenir, 'Avenir Next', sans-serif" },
      { label: "Optima", value: "Optima, sans-serif" },
      { label: "Geneva", value: "Geneva, sans-serif" },
    ],
  },
  {
    group: "Serif",
    fonts: [
      { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
      { label: "Georgia", value: "Georgia, serif" },
      { label: "Palatino", value: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
      { label: "Garamond", value: "Garamond, serif" },
      { label: "Baskerville", value: "Baskerville, serif" },
      { label: "Didot", value: "Didot, serif" },
      { label: "Hoefler Text", value: "'Hoefler Text', serif" },
      { label: "Cambria", value: "Cambria, serif" },
    ],
  },
  {
    group: "Monospace",
    fonts: [
      { label: "Courier New", value: "'Courier New', Courier, monospace" },
      { label: "Consolas", value: "Consolas, monospace" },
      { label: "Monaco", value: "Monaco, monospace" },
      { label: "Menlo", value: "Menlo, monospace" },
      { label: "Andale Mono", value: "'Andale Mono', monospace" },
      { label: "Lucida Console", value: "'Lucida Console', monospace" },
    ],
  },
  {
    group: "Display / Script",
    fonts: [
      { label: "Impact", value: "Impact, sans-serif" },
      { label: "Comic Sans MS", value: "'Comic Sans MS', cursive" },
      { label: "Brush Script MT", value: "'Brush Script MT', cursive" },
      { label: "Copperplate", value: "Copperplate, serif" },
      { label: "Snell Roundhand", value: "'Snell Roundhand', cursive" },
    ],
  },
];

// Pixel-valued sizes — mapped to real CSS so the spans we emit render the
// same across every email client.
const FONT_SIZES: FontOption[] = [
  { label: "Tiny (10)", value: "10px" },
  { label: "Small (12)", value: "12px" },
  { label: "Normal (14)", value: "14px" },
  { label: "Medium (16)", value: "16px" },
  { label: "Large (18)", value: "18px" },
  { label: "XL (22)", value: "22px" },
  { label: "Huge (28)", value: "28px" },
  { label: "Giant (36)", value: "36px" },
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
  const [systemFonts, setSystemFonts] = React.useState<FontOption[] | null>(null);
  const [linkUrl, setLinkUrl] = React.useState("");
  const savedRangeRef = React.useRef<Range | null>(null);

  React.useLayoutEffect(() => {
    if (!seededRef.current && editorRef.current) {
      editorRef.current.innerHTML = value || "";
      seededRef.current = true;
    }
  }, [value]);

  // Try the Local Font Access API (Chromium). Safari/WebKit doesn't implement
  // it yet — in that case we silently fall back to the curated list.
  React.useEffect(() => {
    const win = window as unknown as {
      queryLocalFonts?: () => Promise<Array<{ family: string; fullName: string }>>;
    };
    if (typeof win.queryLocalFonts !== "function") return;
    let cancelled = false;
    (async () => {
      try {
        const result = await win.queryLocalFonts!();
        if (cancelled) return;
        const seen = new Set<string>();
        const opts: FontOption[] = [];
        for (const f of result) {
          if (seen.has(f.family)) continue;
          seen.add(f.family);
          opts.push({ label: f.family, value: `"${f.family}"` });
        }
        opts.sort((a, b) => a.label.localeCompare(b.label));
        setSystemFonts(opts);
      } catch {
        // Permission denied, or API threw — stay with curated list
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const saveSelection = React.useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Only save ranges that live inside this editor — don't capture selections
    // that belong to toolbar inputs or anything else in the document.
    if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = React.useCallback(() => {
    const range = savedRangeRef.current;
    if (!range || !editorRef.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  // Wrap the current selection in a <span> with the given inline style, or
  // (if the selection is collapsed) insert a styled span containing a
  // zero-width placeholder so the next character typed inherits the style.
  // This bypasses document.execCommand entirely, which is unreliable for
  // fontName/fontSize inside Tauri's WebKit renderer.
  const applyInlineStyle = (property: "fontFamily" | "fontSize", value: string) => {
    ensureEditorSelection();
    focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const root = editorRef.current;
    if (!root || !root.contains(range.commonAncestorContainer)) return;

    if (range.collapsed) {
      // Typing-attribute path: insert a styled span with a zero-width space
      // and place the caret just after the ZWSP so new characters inherit it.
      const span = document.createElement("span");
      span.style.setProperty(property === "fontFamily" ? "font-family" : "font-size", value);
      span.appendChild(document.createTextNode("\u200B"));
      range.insertNode(span);
      const newRange = document.createRange();
      const txt = span.firstChild as Text;
      newRange.setStart(txt, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      // Range selection: extract contents, wrap in a styled span, reinsert.
      const contents = range.extractContents();
      const span = document.createElement("span");
      span.style.setProperty(property === "fontFamily" ? "font-family" : "font-size", value);
      span.appendChild(contents);
      range.insertNode(span);
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
    emit();
    saveSelection();
  };

  function ensureEditorSelection() {
    if (savedRangeRef.current) {
      restoreSelection();
      return;
    }
    // No prior selection — place caret at end of editor so the next command
    // (e.g. fontName, fontSize) affects the typing attribute for what comes next.
    const el = editorRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const exec = (cmd: string, arg?: string) => {
    ensureEditorSelection();
    focus();
    // Emit <span style="..."> instead of deprecated <font> tags so font-family
    // and font-size changes render reliably and survive the MIME roundtrip.
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* older browsers throw; ignore */
    }
    document.execCommand(cmd, false, arg);
    emit();
    saveSelection();
  };

  const insertHtml = (html: string) => {
    ensureEditorSelection();
    focus();
    document.execCommand("insertHTML", false, html);
    emit();
    saveSelection();
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
        onBeforeDropdownOpen={saveSelection}
        onFontFamily={(v) => applyInlineStyle("fontFamily", v)}
        onFontSize={(v) => applyInlineStyle("fontSize", v)}
        systemFonts={systemFonts}
      />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onBlur={() => {
          saveSelection();
          emit();
        }}
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
  onBeforeDropdownOpen,
  onFontFamily,
  onFontSize,
  systemFonts,
}: {
  exec: (cmd: string, arg?: string) => void;
  onLink: () => void;
  onBeforeDropdownOpen: () => void;
  onFontFamily: (v: string) => void;
  onFontSize: (v: string) => void;
  systemFonts: FontOption[] | null;
}) {
  // Per-button onMouseDown={preventDefault} (on IconBtn / ColorPopButton) already
  // keeps the editor focused when clicking toolbar icons. Applying a container-
  // level preventDefault here would also cancel native <select> dropdown opening,
  // which is what happened in v0.1.6 — removed.
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
    >
      <GroupedToolbarSelect
        title="Font family"
        onChange={onFontFamily}
        onBeforeOpen={onBeforeDropdownOpen}
        groups={
          systemFonts
            ? [{ group: "System fonts", fonts: systemFonts }]
            : CURATED_FONTS
        }
        placeholder="Font"
        width={150}
      />
      <ToolbarSelect
        title="Font size"
        onChange={onFontSize}
        onBeforeOpen={onBeforeDropdownOpen}
        options={FONT_SIZES}
        placeholder="Size"
        width={110}
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

function GroupedToolbarSelect({
  onChange,
  onBeforeOpen,
  groups,
  placeholder,
  title,
  width,
}: {
  onChange: (v: string) => void;
  onBeforeOpen?: () => void;
  groups: { group: string; fonts: FontOption[] }[];
  placeholder: string;
  title: string;
  width: number;
}) {
  return (
    <select
      title={title}
      onMouseDown={() => onBeforeOpen?.()}
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
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.fonts.map((o) => (
            <option key={o.value} value={o.value} style={{ fontFamily: o.value }}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function ToolbarSelect({
  onChange,
  onBeforeOpen,
  options,
  placeholder,
  title,
  width,
}: {
  onChange: (v: string) => void;
  onBeforeOpen?: () => void;
  options: { label: string; value: string }[];
  placeholder: string;
  title: string;
  width: number;
}) {
  return (
    <select
      title={title}
      onMouseDown={() => {
        // Capture the editor's current range BEFORE the native dropdown steals
        // focus. This is what makes fontName / fontSize apply to the right text.
        onBeforeOpen?.();
      }}
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
