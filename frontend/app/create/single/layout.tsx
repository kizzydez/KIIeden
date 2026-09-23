import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an NFT",
  description: "Upload artwork, set a mint schedule, and get a minting link to share.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
