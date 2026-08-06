import { useEffect, useState } from "react";
import { Check, ChevronRight, Clock3, Download, FileBarChart, FileSpreadsheet, Search } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { DashboardSummary, ReportItem } from "@shared/api";
import { authFetch, getAuthUser } from "@/lib/apiClient";

export function DashboardView() {
  const user = getAuthUser();
  const formattedName = user?.name || "User";

  const [period, setPeriod] = useState("Month");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [summaryData, setSummaryData] = useState<DashboardSummary["metrics"]>({
    reportsInPeriod: 0,
    approvedReports: 0,
    pendingReview: 0,
    recordsProcessed: 0,
  });
  const [reportsData, setReportsData] = useState<ReportItem[]>([]);
  const periods = ["Day", "Week", "Month", "Year"];

  useEffect(() => {
    authFetch(`/api/dashboard/summary?period=${period}`)
      .then(async (res) => {
        const type = res.headers.get("content-type");
        if (res.ok && type && type.includes("application/json")) {
          return res.json();
        }
        return null;
      })
      .then((res) => {
        if (res && res.success && res.data) {
          setSummaryData(res.data.metrics);
          setReportsData(res.data.reports || []);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch dashboard summary:", err);
      });
  }, [period]);

  const filteredRows = reportsData.filter((row) =>
    `${row.reportId || row._id || row.id || ""} ${row.name || ""} ${row.type || ""} ${row.owner || ""} ${row.source || ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const exportReport = () => {
    if (!filteredRows.length) {
      setNotice("No report data available to export");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    const header = "Report ID,Report Name,Type,Source,Owner,Records,Status";
    const body = filteredRows
      .map((row) =>
        [
          row.reportId || row._id || row.id || "REP",
          row.name,
          row.type,
          row.source,
          row.owner,
          String(row.rowsCount || 0),
          row.status,
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sg-report-reports-${period.toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`${filteredRows.length} filtered reports exported`);
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <span>Main menu</span>
            <ChevronRight size={12} />
            <span className="text-slate-600">Dashboard</span>
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950">
            Welcome, {formattedName}
          </h1>
        </div>
        <button
          onClick={exportReport}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#18476A] px-4 text-sm font-semibold text-white shadow-lg shadow-[#18476A]/20 hover:bg-[#18476A]"
        >
          <Download size={16} />
          Export filtered data
        </button>
      </div>

      <div className="mb-6 flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_15px_rgba(28,25,64,0.03)] sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold text-slate-800">Report period</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Choose the reporting window for your summary.
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {periods.map((item) => (
            <button
              key={item}
              onClick={() => setPeriod(item)}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                period === item ? "bg-white text-[#18476A] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Reports in period", String(summaryData.reportsInPeriod), FileBarChart, "bg-[#eef6fa] text-[#18476A]"],
          ["Approved reports", String(summaryData.approvedReports), Check, "bg-emerald-50 text-emerald-600"],
          ["Pending review", String(summaryData.pendingReview), Clock3, "bg-amber-50 text-amber-600"],
          ["Records processed", summaryData.recordsProcessed.toLocaleString(), FileSpreadsheet, "bg-blue-50 text-blue-600"],
        ].map(([label, value, Icon, tone]) => {
          const LucideIcon = Icon as typeof FileBarChart;
          return (
            <div
              key={label as string}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_15px_rgba(28,25,64,0.03)]"
            >
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${tone as string}`}>
                <LucideIcon size={19} />
              </div>
              <p className="mt-4 text-xs font-medium text-slate-500">{label as string}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value as string}</p>
              <p className="mt-1 text-[11px] text-slate-400">{period} view</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Report records</h3>
            <p className="mt-1 text-xs text-slate-400">
              Data available for the selected {period.toLowerCase()} view
            </p>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search report data..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] sm:w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                <th className="px-6 py-3.5">Report ID</th>
                <th className="py-3.5">Report type</th>
                <th className="py-3.5">Source</th>
                <th className="py-3.5">Owner</th>
                <th className="py-3.5">Records</th>
                <th className="py-3.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.reportId || row._id || row.id} className="border-b border-slate-50 hover:bg-[#eef6fa]/30">
                  <td className="px-6 py-4 text-xs font-bold text-slate-700">
                    {row.reportId || row._id || row.id || "REP-100"}
                  </td>
                  <td className="py-4 text-xs font-semibold text-slate-600">{row.name || row.type}</td>
                  <td className="py-4 text-[11px] text-slate-500">{row.source}</td>
                  <td className="py-4 text-xs text-slate-600">{row.owner}</td>
                  <td className="py-4 text-xs font-semibold text-slate-600">{row.rowsCount || 0}</td>
                  <td className="py-4">
                    <StatusBadge
                      status={row.status}
                      color={
                        row.status === "Pending"
                          ? "amber"
                          : row.status === "Review"
                          ? "blue"
                          : "emerald"
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">
              No report data uploaded yet.
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-6 py-3.5 text-[11px] text-slate-400">
          Showing <span className="font-semibold text-slate-600">{filteredRows.length}</span> report records for the selected {period.toLowerCase()} view.
        </div>
      </div>

      {notice && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
