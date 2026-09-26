/// Small line-icon set (stroke icons, no emoji). Sized with the parent's font size.
const PATHS: Record<string, string> = {
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6L6 18",
  image: "M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5M9 9.5h.01",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.5-4.5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3",
  building: "M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18",
  file: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  copy: "M9 9h11v11H9zM5 15V4h11",
  clock: "M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4.5l3 1.5",
  wallet: "M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 7l11-3v3M16 13.5h.01",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  chart: "M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8h.01",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  menu: "M4 7h16M4 12h16M4 17h16",
  sun: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  phone: "M6.5 4h3l1.2 4-2 1.3a11 11 0 005 5l1.3-2 4 1.2v3a2 2 0 01-2.2 2A16 16 0 014.5 6.2 2 2 0 016.5 4z",
  mail: "M4 6h16v12H4zM4 6l8 7 8-7",
  chevronDown: "M6 9l6 6 6-6",
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "", strokeWidth = 1.6 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
