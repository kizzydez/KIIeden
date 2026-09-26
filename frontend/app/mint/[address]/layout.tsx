import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mint",
  description: "Mint from this collection while its mint is open on KiiEden.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
