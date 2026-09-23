import { GridSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="page-enter">
      <div className="skeleton mb-8 h-10 w-64 rounded-xl" />
      <GridSkeleton count={8} />
    </div>
  );
}
