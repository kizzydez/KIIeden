import Link from "next/link";
import Icon from "@/components/Icon";

export const metadata = { title: "Page not found | KiiEden" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center page-enter">
      <p className="font-display text-7xl font-bold text-gradient">404</p>
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-white">This page doesn&apos;t exist</h1>
      <p className="mt-3 leading-relaxed text-zinc-400">The link may be out of date, or the address may be mistyped. Nothing was lost — your wallet and assets are unaffected.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">
          <Icon name="arrow" /> Back to home
        </Link>
        <Link href="/explore" className="btn btn-secondary">
          Explore
        </Link>
        <Link href="/search" className="btn btn-ghost">
          Search
        </Link>
      </div>
    </div>
  );
}
