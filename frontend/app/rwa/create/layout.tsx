import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "List a Real-World Asset",
  description: "Admin tools to list a fractional real-world asset for its IPO.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
