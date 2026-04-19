import React from "react";

export type IconProps = { size?: number; stroke?: string; strokeWidth?: number };

const icon =
  (d: string, extra: React.ReactNode = null) =>
  ({ size = 16, stroke = "currentColor", strokeWidth = 1.5 }: IconProps = {}) =>
    (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
        {extra}
      </svg>
    );

export const IconSheet = icon("M6 3h9l4 4v14H6z M15 3v4h4");
export const IconMail = icon("M3 6h18v12H3z M3 6l9 7 9-7");
export const IconPaperclip = icon("M21 12l-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5L10.5 18.5a2 2 0 0 1-3-3L16 7");
export const IconFolder = icon("M3 6h6l2 2h10v11H3z");
export const IconKey = icon("M14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M14 10l7 7-3 3-2-2-2 2-2-2");
export const IconSend = icon("M22 2L11 13 M22 2l-7 20-4-9-9-4z");
export const IconCheck = icon("M4 12l5 5L20 6");
export const IconPlus = icon("M12 5v14 M5 12h14");
export const IconGrip = icon("M9 6h.01 M9 12h.01 M9 18h.01 M15 6h.01 M15 12h.01 M15 18h.01");
export const IconSearch = icon("M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z M21 21l-4.3-4.3");
export const IconChevron = icon("M9 6l6 6-6 6");
export const IconDot = icon("M12 12h.01");
export const IconX = icon("M6 6l12 12 M18 6L6 18");
export const IconDoc = icon("M7 3h8l4 4v14H7z M15 3v4h4");
export const IconImage = icon("M4 5h16v14H4z M4 15l5-5 5 5 3-3 3 3");
export const IconCalendar = icon("M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4");
