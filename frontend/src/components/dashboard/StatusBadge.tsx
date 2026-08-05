interface StatusBadgeProps {
  status: string;
  color: string;
}

export function StatusBadge({ status, color }: StatusBadgeProps) {
  const styles: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
  };

  const activeStyle = styles[color] || "bg-slate-50 text-slate-700 ring-slate-200";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${activeStyle}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
