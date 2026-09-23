import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search",
  description: "Search KiiEden for a collection or real-world asset by name, symbol, or address.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
