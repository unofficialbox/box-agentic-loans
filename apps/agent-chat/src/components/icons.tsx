/** Line icons at 16px, 1.5px stroke, drawn in currentColor: one family for the chrome. */

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    {children}
  </svg>
);

/** A window with a pane on the left (or right, mirrored): toggles a sidebar. */
export const PanelIcon = ({ side }: { side: "left" | "right" }) => (
  <Svg>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
    {side === "left" ? <path d="M6 2.75v10.5" /> : <path d="M10 2.75v10.5" />}
  </Svg>
);

export const NewChatIcon = () => (
  <Svg>
    <path d="M13.25 8.5v3.75a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1H7.5" />
    <path d="M11.9 2.1a1.2 1.2 0 0 1 1.7 1.7L8.25 9.15 6 9.75l.6-2.25z" />
  </Svg>
);

export const FileIcon = () => (
  <Svg>
    <path d="M4.25 1.75h5l3 3v9a.75.75 0 0 1-.75.75h-7.25a.75.75 0 0 1-.75-.75v-11.25a.75.75 0 0 1 .75-.75z" />
    <path d="M9.25 1.75v3h3" />
  </Svg>
);

/** A policy: a page with lines, for credit policy citations. */
export const PolicyIcon = () => (
  <Svg>
    <rect x="3" y="1.75" width="10" height="12.5" rx="1" />
    <path d="M5.5 5h5M5.5 7.75h5M5.5 10.5h3" />
  </Svg>
);

export const ExternalIcon = () => (
  <Svg>
    <path d="M6.5 3.25h-2.75a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.75" />
    <path d="M9.5 2.75h3.75v3.75M13.25 2.75l-6 6" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Svg>
);
