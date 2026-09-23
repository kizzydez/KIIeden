"use client";

import { useRef, useState, type DragEvent } from "react";

/// Drag-and-drop / click-to-browse file picker with a glowing drag state.
export default function DropZone({
  accept,
  multiple = false,
  onFiles,
  label,
  hint,
  children,
  labelledBy,
}: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label: string;
  hint?: string;
  children?: React.ReactNode;
  labelledBy?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    handle(e.dataTransfer.files);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-labelledby={labelledBy}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-300 ${
        over ? "border-accent-400 bg-accent-500/10 shadow-glow-lg scale-[1.01]" : "border-white/15 hover:border-accent-500/60 hover:bg-white/[0.02]"
      }`}
    >
      <input ref={input} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => handle(e.target.files)} />
      {children}
      <p className="text-sm font-semibold text-white">{label}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
