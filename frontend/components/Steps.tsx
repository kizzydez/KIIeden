import Icon from "./Icon";

/// Horizontal progress steps for multi-stage flows (upload → pin → sign → done).
export default function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 mb-4">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className={`grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 transition-all duration-500 ${
                done ? "bg-emerald-500 text-black" : active ? "bg-accent-500 text-white shadow-[0_0_14px_#9b5cff]" : "bg-white/10 text-zinc-400"
              }`}
            >
              {done ? <Icon name="check" /> : i + 1}
            </span>
            <span className={`text-xs truncate ${active ? "text-white font-semibold" : "text-zinc-400"}`}>{label}</span>
            {i < steps.length - 1 && <span className={`h-px flex-1 transition-colors duration-500 ${done ? "bg-emerald-500/60" : "bg-white/10"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
