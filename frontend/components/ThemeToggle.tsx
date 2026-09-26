"use client";

import Icon from "./Icon";
import { useTheme } from "./ThemeProvider";

/// Switches between the dark (purple + black) and light (ivory + purple) theme.
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const toLight = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-secondary btn-sm !px-3 ${className}`}
      aria-label={toLight ? "Switch to light mode" : "Switch to dark mode"}
      title={toLight ? "Light mode" : "Dark mode"}
    >
      <Icon name={toLight ? "sun" : "moon"} className="text-[1.1em]" strokeWidth={1.7} />
      <span className="sr-only">{toLight ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
