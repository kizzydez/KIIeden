import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore NFTs",
  description: "Browse collections minting now and every NFT listed for sale on KiiEden.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
