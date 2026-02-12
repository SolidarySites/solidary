import type { ReactNode } from "react";

type IconProps = {
  children: ReactNode;
};

const Icon = ({ children }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const GlyphIcon = ({ glyph }: { glyph: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <text x="12" y="16" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="currentColor">
      {glyph}
    </text>
  </svg>
);

export const AlignLeftIcon = () => (
  <Icon>
    <path d="M5 7h14" />
    <path d="M5 11h10" />
    <path d="M5 15h14" />
    <path d="M5 19h9" />
  </Icon>
);

export const AlignCenterIcon = () => (
  <Icon>
    <path d="M5 7h14" />
    <path d="M7 11h10" />
    <path d="M5 15h14" />
    <path d="M8 19h8" />
  </Icon>
);

export const AlignRightIcon = () => (
  <Icon>
    <path d="M5 7h14" />
    <path d="M9 11h10" />
    <path d="M5 15h14" />
    <path d="M10 19h9" />
  </Icon>
);

export const BulletedListIcon = () => (
  <Icon>
    <circle cx="6" cy="7.5" r="1.2" />
    <circle cx="6" cy="12" r="1.2" />
    <circle cx="6" cy="16.5" r="1.2" />
    <path d="M10 7.5h8" />
    <path d="M10 12h8" />
    <path d="M10 16.5h8" />
  </Icon>
);

export const NumberedListIcon = () => (
  <Icon>
    <path d="M5 7h2v4" />
    <path d="M5 11h2" />
    <path d="M5 13.5h2l-2 3h2" />
    <path d="M10 7.5h8" />
    <path d="M10 12h8" />
    <path d="M10 16.5h8" />
  </Icon>
);

export const QuoteIcon = () => (
  <Icon>
    <path d="M7 9h4v5H7z" />
    <path d="M13 9h4v5h-4z" />
    <path d="M11 14.5c0 1.9-1.2 3.4-3 3.5" />
    <path d="M17 14.5c0 1.9-1.2 3.4-3 3.5" />
  </Icon>
);

export const LinkIcon = () => (
  <Icon>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M8 16a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-.5.5" />
    <path d="M16 8a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 1 1-5-5l.5-.5" />
  </Icon>
);

export const ImageIcon = () => (
  <Icon>
    <rect x="4.5" y="6" width="15" height="12" rx="1.5" />
    <circle cx="9" cy="10" r="1.3" />
    <path d="m7 16 3.2-3.2a1.2 1.2 0 0 1 1.7 0L13 14l1.5-1.5a1.2 1.2 0 0 1 1.7 0L18 14.3" />
  </Icon>
);

export const ClearIcon = () => (
  <Icon>
    <path d="M4 15h8" />
    <path d="m8 5 8 8" />
    <path d="m14.5 5 4.5 4.5-5 5H8.5L5 11.5 11.5 5z" />
  </Icon>
);

