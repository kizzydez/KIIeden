"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spinner ${className}`} aria-hidden />;
}

/// Button with a built-in loading state. `busy` shows a spinner + `busyLabel`
/// and disables the button so double-clicks can't send two transactions.
export function TxButton({
  busy = false,
  busyLabel,
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...rest
}: {
  busy?: boolean;
  busyLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
    >
      {busy && <Spinner />}
      <span>{busy && busyLabel ? busyLabel : children}</span>
    </button>
  );
}

export function EmptyState({
  icon = "sparkle",
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="glass px-8 py-14 text-center page-enter">
      <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-xl text-accent-300">
        <Icon name={icon} />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight text-white">{title}</h3>
      {body && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">{body}</p>}
      {action && (
        <Link href={action.href} className="btn btn-primary mt-7">
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, right, eyebrow }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-5 page-enter">
      <div>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass overflow-hidden">
      <div className="skeleton aspect-square" />
      <div className="p-4 space-y-2.5">
        <div className="skeleton h-3.5 w-3/5 rounded" />
        <div className="skeleton h-4 w-2/5 rounded" />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="glass px-5 py-5 sm:px-6">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{children}</p>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="glass p-4 text-sm text-rose-300 border-rose-500/30">{children}</div>;
}
