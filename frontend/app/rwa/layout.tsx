import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Real-World Assets",
  description: "Back fractional real-world assets during their IPO, then trade units on a live demand and supply curve.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
