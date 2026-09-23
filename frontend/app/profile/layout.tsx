import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Profile",
  description: "Your NFTs, created collections, RWA holdings and earnings.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
