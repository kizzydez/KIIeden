import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a Collection",
  description: "Upload a collection of NFTs, set a mint schedule, and get a minting link to share.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
