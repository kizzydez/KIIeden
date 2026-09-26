import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about minting, trading, real-world assets, fees and security on KiiEden.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
