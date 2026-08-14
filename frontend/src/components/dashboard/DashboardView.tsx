import { useEffect, useState } from "react";
import { Check, ChevronRight, Clock3, Download, FileBarChart, FileSpreadsheet, Search } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { DashboardSummary, ReportItem } from "@shared/api";
import { authFetch, getAuthUser } from "@/lib/apiClient";

export function DashboardView() {
  const user = getAuthUser();
  const formattedName = user?.name || "User";

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [summaryData, setSummaryData] = useState<DashboardSummary["metrics"]>({
    reportsInPeriod: 0,
    approvedReports: 0,
    pendingReview: 0,
    recordsProcessed: 0,
  });
  const [reportsData, setReportsData] = useState<ReportItem[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);

    const queryStr = params.toString();
    const url = `/api/dashboard/summary${queryStr ? `?${queryStr}` : ""}`;

    authFetch(url)
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
  }, [fromDate, toDate]);

  const formatCreatedDate = (dateVal?: string | Date) => {
    if (!dateVal) return "N/A";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const filteredRows = reportsData.filter((row) =>
    `${row.reportId || row._id || row.id || ""} ${row.name || ""} ${row.type || ""} ${row.owner || ""} ${row.source || ""} ${row.createdAt || ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const rangeLabel =
    fromDate && toDate
      ? `${fromDate} to ${toDate}`
      : fromDate
      ? `From ${fromDate}`
      : toDate
      ? `Up to ${toDate}`
      : "All time view";

  const exportReport = () => {
    if (!filteredRows.length) {
      setNotice("No report data available to export");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    const header = "Report ID,Report Name,Type,Created Date,Source,Owner,Records,Status";
    const body = filteredRows
      .map((row) =>
        [
          row.reportId || row._id || row.id || "REP",
          row.name,
          row.type,
          formatCreatedDate(row.createdAt),
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
    anchor.download = `sg-report-dashboard-${fromDate || "all"}-to-${toDate || "all"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`${filteredRows.length} filtered reports exported`);
    window.setTimeout(() => setNotice(""), 2200);
  };

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <span>Main menu</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Dashboard</span>
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

      <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_15px_rgba(28,25,64,0.03)] sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold text-slate-800">Date filter</p>
          <p className="mt-1 text-[11px] text-slate-600">
            Select From and To dates to filter dashboard metrics and report records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-[#8fc3e0] focus:bg-white focus:ring-2 focus:ring-[#dbeaf2]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-[#8fc3e0] focus:bg-white focus:ring-2 focus:ring-[#dbeaf2]"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-600 hover:bg-slate-200 transition"
            >
              Clear
            </button>
          )}
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
              <p className="mt-4 text-xs font-semibold text-slate-600">{label as string}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value as string}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-600">{rangeLabel}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_15px_rgba(28,25,64,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Report records</h3>
            <p className="mt-1 text-xs text-slate-600">
              Data available for {rangeLabel.toLowerCase()}
            </p>
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search report data..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] sm:w-56 text-slate-700"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-600">
                <th className="px-6 py-3.5">Report ID</th>
                <th className="py-3.5">Report type</th>
                <th className="py-3.5">Created Date</th>
                <th className="py-3.5">Source</th>
                <th className="py-3.5">User</th>
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
                  <td className="py-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                    {formatCreatedDate(row.createdAt)}
                  </td>
                  <td className="py-4 text-[11px] text-slate-600">{row.source}</td>
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
            <div className="p-10 text-center text-sm font-medium text-slate-600">
              No report data found for the selected criteria.
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-6 py-3.5 text-[11px] font-medium text-slate-600">
          Showing <span className="font-semibold text-slate-800">{filteredRows.length}</span> report records for {rangeLabel.toLowerCase()}.
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
