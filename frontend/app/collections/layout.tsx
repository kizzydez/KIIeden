import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Collections",
  description: "Every collection launched on KiiEden, with live mint status and floor price.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
