"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Icon from "./Icon";
import { useIsRwaAdmin } from "@/lib/data";
import ThemeToggle from "./ThemeToggle";
import { IS_MAINNET } from "@/lib/config";

const LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/collections", label: "Collections" },
  { href: "/rwa", label: "RWA" },
];

export default function Nav() {
  const pathname = usePathname() || "/";
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { isAdmin } = useIsRwaAdmin();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setCreateOpen(false);
    }
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    document.addEventListener("click", onDoc);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("click", onDoc);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setCreateOpen(false);
  }, [pathname]);

  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled ? "bg-base-950/75 backdrop-blur-xl border-b border-white/[0.06] shadow-soft" : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="relative">
            <span className="absolute inset-0 rounded-xl bg-accent-500/40 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            <Image src="/logo-mark.png" alt="" width={38} height={38} priority className="relative rounded-xl ring-1 ring-white/10" />
          </span>
          <span className="font-display font-bold text-xl tracking-tight">
            Kii<span className="text-accent-400">Eden</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link" aria-current={active(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <div className="relative" ref={ref}>
            <button
              className="nav-link flex items-center gap-1"
              onClick={() => setCreateOpen((v) => !v)}
              aria-expanded={createOpen}
              aria-current={pathname.startsWith("/create") || pathname === "/rwa/create" ? "page" : undefined}
            >
              Create
              <Icon name="chevronDown" className={`text-[13px] transition-transform ${createOpen ? "rotate-180" : ""}`} />
            </button>
            {createOpen && (
              <div className="menu-pop glass absolute top-9 left-0 w-56 p-2 flex flex-col gap-1">
                <Link href="/create/single" className="px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm">
                  <span className="font-medium text-white">Single NFT</span>
                  <span className="block text-xs text-zinc-400">One artwork, one minting link</span>
                </Link>
                <Link href="/create/collection" className="px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm">
                  <span className="font-medium text-white">Collection</span>
                  <span className="block text-xs text-zinc-400">Thousands of images, one minting link</span>
                </Link>
                {isAdmin && (
                  <Link href="/rwa/create" className="px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm">
                    <span className="font-medium text-white">RWA asset</span>
                    <span className="block text-xs text-zinc-400">Admin</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-2.5">
          {!IS_MAINNET && <span className="hidden sm:inline-flex badge badge-warn">Testnet</span>}
          <Link href="/search" className="btn btn-ghost btn-sm !px-2.5" aria-label="Search KiiEden">
            <Icon name="search" />
          </Link>
          <ThemeToggle className="hidden sm:inline-flex" />
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} />
          <button
            className="md:hidden btn btn-secondary btn-sm !px-3"
            aria-label="Menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Icon name={mobileOpen ? "x" : "menu"} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden menu-pop glass mx-3 mb-3 p-3 flex flex-col">
          {[
            ...LINKS,
            { href: "/profile", label: "Profile" },
            { href: "/search", label: "Search" },
            { href: "/faq", label: "Help & FAQ" },
            { href: "/create/single", label: "Create NFT" },
            { href: "/create/collection", label: "Create collection" },
            ...(isAdmin ? [{ href: "/rwa/create", label: "Create RWA asset" }] : []),
          ].map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-3 rounded-xl hover:bg-white/5 text-sm font-medium" aria-current={active(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-white/10 px-3 pt-3">
            <span className="text-sm text-zinc-400">Appearance</span>
            <ThemeToggle />
          </div>
        </div>
      )}
    </header>
  );
}
