import { useEffect, useState } from "react";
import {
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Coins,
  Printer,
} from "lucide-react";
import { authFetch } from "@/lib/apiClient";
import type { PermissionActions } from "@shared/api";

export interface CurrentRateItem {
  _id: string;
  title: string;
  rate: number;
  unit?: string;
  code?: string;
  status: "Active" | "Inactive";
  createdAt?: string;
  updatedAt?: string;
  baseRate?: number;
  serviceProvider?: string;
}

interface RateMasterViewProps {
  permissions?: PermissionActions;
}

export function RateMasterView({ permissions }: RateMasterViewProps) {
  const canAdd = permissions?.add ?? true;
  const canUpdate = permissions?.update ?? true;
  const canDelete = permissions?.delete ?? true;

  const [rates, setRates] = useState<CurrentRateItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Rate input state
  const [newRate, setNewRate] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Inline edit state for the single card
  const [isEditing, setIsEditing] = useState(false);
  const [editRate, setEditRate] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete modal state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // From Sender (Print Line) Master State
  const [senderLine, setSenderLine] = useState("");
  const [senderSavedValue, setSenderSavedValue] = useState("");
  const [senderLoading, setSenderLoading] = useState(false);
  const [senderSaving, setSenderSaving] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRates = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/courier/rate-masters");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const normalized: CurrentRateItem[] = json.data.map((item: any) => ({
            _id: item._id,
            title: "Gold Rate",
            rate:
              Number(item.rate !== undefined ? item.rate : item.baseRate) || 0,
            unit: item.unit || "",
            code: item.code || "",
            status: item.status || "Active",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }));
          setRates(normalized.slice(0, 1));
        }
      } else {
        showToast("Failed to fetch rates", "error");
      }
    } catch (err) {
      console.error("Error fetching rates:", err);
      showToast("Could not load current rate", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchSenderSetting = async () => {
    setSenderLoading(true);
    try {
      const res = await authFetch("/api/courier/settings/from-sender");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.value) {
          setSenderLine(json.data.value);
          setSenderSavedValue(json.data.value);
        }
      }
    } catch (err) {
      console.error("Error fetching sender setting:", err);
    } finally {
      setSenderLoading(false);
    }
  };

  const handleSaveSender = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = senderLine.trim();
    if (!clean) {
      showToast("Please enter a valid sender line", "error");
      return;
    }
    setSenderSaving(true);
    try {
      const res = await authFetch("/api/courier/settings/from-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: clean }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save sender line");
      }
      setSenderSavedValue(json.data.value);
      setSenderLine(json.data.value);
      showToast("From Sender (Print Line) updated successfully!");
    } catch (err: any) {
      showToast(err.message || "Failed to save sender line", "error");
    } finally {
      setSenderSaving(false);
    }
  };

  useEffect(() => {
    fetchRates();
    fetchSenderSetting();
  }, []);

  // Quick Add or Replace existing Gold Rate
  const handleSaveRate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAddError("");

    const cleanRateStr = newRate.toString().replace(/,/g, "").trim();
    const rateNum = Number(cleanRateStr);

    if (!cleanRateStr || isNaN(rateNum) || rateNum <= 0) {
      setAddError("Please enter a valid rate amount (e.g. 150000)");
      return;
    }

    setAddLoading(true);
    try {
      const res = await authFetch("/api/courier/rate-masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Gold Rate",
          rate: rateNum,
          status: "Active",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save rate");
      }

      showToast(`Gold Rate set to ₹${rateNum.toLocaleString("en-IN")}`);
      setNewRate("");
      fetchRates();
    } catch (err: any) {
      setAddError(err.message || "Could not save rate");
    } finally {
      setAddLoading(false);
    }
  };

  // Start inline editing
  const startEditing = () => {
    if (!rates[0]) return;
    setIsEditing(true);
    setEditRate(String(rates[0].rate));
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditRate("");
  };

  // Save inline edit
  const handleSaveEdit = async () => {
    if (!rates[0]) return;
    const cleanRateStr = editRate.toString().replace(/,/g, "").trim();
    const rateNum = Number(cleanRateStr);

    if (!cleanRateStr || isNaN(rateNum) || rateNum <= 0) {
      showToast("Please enter a valid rate amount", "error");
      return;
    }

    setEditLoading(true);
    try {
      const res = await authFetch(`/api/courier/rate-masters/${rates[0]._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Gold Rate",
          rate: rateNum,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update rate");
      }

      showToast(`Updated Gold Rate to ₹${rateNum.toLocaleString("en-IN")}`);
      cancelEditing();
      fetchRates();
    } catch (err: any) {
      showToast(err.message || "Failed to update rate", "error");
    } finally {
      setEditLoading(false);
    }
  };

  // Execute delete from modal
  const handleConfirmDelete = async () => {
    if (!rates[0]) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`/api/courier/rate-masters/${rates[0]._id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to delete rate");
      }

      showToast("Gold Rate deleted successfully!");
      setDeleteConfirmOpen(false);
      fetchRates();
    } catch (err: any) {
      showToast(err.message || "Failed to delete rate", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const activeRate = rates[0] ?? null;

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold shadow-xl border animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "success"
              ? "bg-emerald-600 text-white border-emerald-500"
              : "bg-rose-600 text-white border-rose-500"
          }`}
        >
          {toast.type === "success" ? (
            <Check size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold shrink-0">
            <Coins size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Rate Master
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                Gold Rate Only
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live market rate for Gold Rate. Any new amount replaces the
              existing rate so only one card is active.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchRates}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
            title="Refresh rate"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── QUICK INLINE SET / REPLACE BAR ─────────────────── */}
      {canAdd && (
        <div className="bg-gradient-to-r from-amber-50/80 via-white to-amber-50/30 dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-800 p-5 rounded-2xl border border-amber-200/70 dark:border-amber-500/20 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                {activeRate ? "Replace Gold Rate" : "Set Gold Rate"}
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              {activeRate
                ? "Entering a new amount will replace the existing Gold Rate card"
                : "Set live Gold Rate"}
            </span>
          </div>

          <form onSubmit={handleSaveRate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              {/* Fixed Gold Rate Badge */}
              <div className="sm:col-span-4 flex items-center px-4 py-2.5 bg-amber-500/10 text-amber-900 dark:text-amber-300 rounded-xl font-bold text-xs border border-amber-300/60 dark:border-amber-600/30">
                <Sparkles
                  size={15}
                  className="mr-2 text-amber-600 dark:text-amber-400 shrink-0"
                />
                <span>Gold Rate</span>
              </div>

              {/* Rate Amount (e.g. 150000) */}
              <div className="sm:col-span-5 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  placeholder={
                    activeRate
                      ? `Current: ₹${activeRate.rate.toLocaleString("en-IN")}`
                      : "Enter Gold Rate (e.g. 150000)"
                  }
                  className="w-full pl-8 pr-3.5 py-2.5 text-xs font-black font-mono rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />
              </div>

              {/* Action Button */}
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={addLoading}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-black rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {addLoading ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : activeRate ? (
                    <RefreshCw size={14} />
                  ) : (
                    <Plus size={16} />
                  )}
                  <span>{activeRate ? "Replace Rate" : "Save Gold Rate"}</span>
                </button>
              </div>
            </div>

            {addError && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                <AlertCircle size={14} />
                <span>{addError}</span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ── CARD VIEW: Single Gold Rate Card ──────────────────────────── */}
      {loading ? (
        <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col items-center justify-center gap-3 text-slate-400">
          <RefreshCw size={24} className="animate-spin text-amber-500" />
          <span className="text-xs font-bold">Loading Gold Rate card...</span>
        </div>
      ) : !activeRate ? (
        <div className="bg-white dark:bg-slate-800 p-12 rounded-2xl border-2 border-dashed border-amber-200/70 dark:border-amber-500/20 shadow-xs flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 place-items-center grid rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-3">
            <Coins size={32} />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            No Gold Rate Configured
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-3">
            Enter a rate amount above and click "Save Gold Rate" to set the live
            rate card.
          </p>
        </div>
      ) : (
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group hover:border-amber-400/60 dark:hover:border-amber-400/40 relative">
            {/* Top Header */}
            <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-700/60 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white grid place-items-center font-bold shrink-0 shadow-xs">
                  <Sparkles size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">
                    Gold Rate
                  </h3>
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Current Market Rate
                  </span>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            </div>

            {/* Card Middle: Current Rate Value */}
            <div className="p-5 py-6">
              {isEditing ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Edit Gold Rate Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-base font-black font-mono rounded-xl bg-slate-50 dark:bg-slate-900 border border-amber-400 text-slate-900 dark:text-white focus:outline-hidden"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Current Rate
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      ₹
                    </span>
                    <span className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                      {activeRate.rate.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              )}

              {activeRate.updatedAt && !isEditing && (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Last updated:</span>
                  <span className="font-medium text-slate-500 dark:text-slate-400">
                    {new Date(activeRate.updatedAt).toLocaleDateString(
                      "en-IN",
                      {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Card Footer: Action Buttons (Inline Edit / Delete) */}
            <div className="p-3 px-5 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-end gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={cancelEditing}
                    disabled={editLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X size={13} />
                    <span>Cancel</span>
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={editLoading}
                    className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs cursor-pointer"
                  >
                    {editLoading ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    <span>Save</span>
                  </button>
                </>
              ) : (
                <>
                  {canUpdate && (
                    <button
                      onClick={startEditing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-slate-700 transition cursor-pointer shadow-2xs"
                    >
                      <Edit2 size={13} className="text-amber-500" />
                      <span>Edit</span>
                    </button>
                  )}

                  {canDelete && (
                    <button
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FROM SENDER (PRINT LINE) MASTER CARD ─────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-[#18476A] dark:text-cyan-400 grid place-items-center shrink-0">
              <Printer size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  From Sender (Print Line)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-[#18476A] dark:bg-cyan-950/60 dark:text-cyan-300">
                  Slip Master
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Default sender line printed on all courier consignment slips. In
                future if you change it here, Create Courier will automatically
                update.
              </p>
            </div>
          </div>
          {senderLoading && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <RefreshCw size={13} className="animate-spin text-[#18476A]" />
              <span>Loading sender line...</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSaveSender} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-9 relative">
              <input
                type="text"
                value={senderLine}
                onChange={(e) => setSenderLine(e.target.value)}
                placeholder="From :- S G SURAT 9601511329 - 7405415105"
                className="w-full px-4 py-2.5 text-xs font-bold font-mono rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#18476A]"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                disabled={senderSaving || !canUpdate}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-black rounded-xl bg-[#18476A] hover:bg-[#123652] text-white transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {senderSaving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>Save Sender Line</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">
                Current Active:
              </span>
              <span className="font-mono text-[11px] font-bold text-slate-900 dark:text-white truncate">
                {senderSavedValue ||
                  "From :- S G SURAT 9601511329 - 7405415105"}
              </span>
            </div>
            {senderLine !== senderSavedValue && senderSavedValue && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                Unsaved changes
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── PROFESSIONAL CENTERED DELETE MODAL ───────────────────────── */}
      {deleteConfirmOpen && activeRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 grid place-items-center shrink-0">
                <Trash2
                  size={20}
                  className="text-rose-600 dark:text-rose-400"
                />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Delete Gold Rate
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">
                  Confirm permanent removal
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 my-4 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
              Are you sure you want to delete the{" "}
              <strong className="text-slate-900 dark:text-white font-bold">
                Gold Rate
              </strong>{" "}
              (
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                ₹{activeRate.rate.toLocaleString("en-IN")}
              </span>
              )? This rate card will be removed permanently.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteLoading}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="flex items-center gap-1.5 px-4.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs disabled:opacity-50 transition cursor-pointer"
              >
                {deleteLoading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>Delete Rate</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
