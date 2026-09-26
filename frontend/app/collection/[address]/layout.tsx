import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collection",
  description: "Browse this collection's minted NFTs, mint status and floor price on KiiEden.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
