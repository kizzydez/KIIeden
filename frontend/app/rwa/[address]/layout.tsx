import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Real-World Asset",
  description: "Asset details, IPO status, price chart, order book and trading for this real-world asset on KiiEden.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
