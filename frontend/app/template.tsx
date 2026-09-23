/// A template (unlike a layout) re-mounts on every navigation, so every page
/// gets the same soft fade-up entrance.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
