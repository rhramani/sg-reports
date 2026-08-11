import { useState, useEffect, useRef } from "react";
import {
  User,
  Mail,
  Phone,
  Building,
  Shield,
  Key,
  Lock,
  Camera,
  Check,
  AlertCircle,
  CheckCircle2,
  Eye,
  RefreshCw,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import { authFetch, getAuthUser, setAuthSession, getAuthToken } from "@/lib/apiClient";
import type { UserSession } from "@shared/api";
import { CountryPhoneInput } from "../ui/CountryPhoneInput";

const PRESET_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
];

function getRoleBadgeStyle(role: string) {
  switch (role) {
    case "Super Admin":
      return "bg-amber-50 text-amber-800 border-amber-300 shadow-sm";
    case "Administrator":
      return "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm";
    case "Compliance Officer":
      return "bg-teal-50 text-teal-800 border-teal-300 shadow-sm";
    case "Executive Approver":
      return "bg-purple-50 text-purple-800 border-purple-300 shadow-sm";
    case "Audit Supervisor":
      return "bg-cyan-50 text-cyan-800 border-cyan-300 shadow-sm";
    case "Report Analyst":
      return "bg-blue-50 text-blue-800 border-blue-300 shadow-sm";
    default:
      return "bg-slate-100 text-slate-800 border-slate-300 shadow-sm";
  }
}

export function ProfileView({
  initialTab = "details",
}: {
  initialTab?: "details" | "security";
}) {
  const [sessionUser, setSessionUser] = useState<UserSession | null>(getAuthUser());
  const [activeTab, setActiveTab] = useState<"details" | "security">(
    initialTab === "security" ? "security" : "details"
  );

  // Profile Form state
  const [name, setName] = useState(sessionUser?.name || "");
  const [mobileNumber, setMobileNumber] = useState(sessionUser?.mobileNumber || "");
  const [isPhoneValid, setIsPhoneValid] = useState(true);
  const [department, setDepartment] = useState(sessionUser?.department || "");
  const [avatar, setAvatar] = useState(sessionUser?.avatar || "");
  const [bio, setBio] = useState(sessionUser?.bio || "");

  // Photo modal & avatar upload state
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status & Feedback state
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Security Form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    if (initialTab === "security" || initialTab === "details") {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Fetch full profile data from GET /api/profile
  const loadProfile = () => {
    setFetching(true);
    authFetch("/api/profile")
      .then(async (res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((res) => {
        if (res && res.success && res.data) {
          const u = res.data as UserSession;
          setSessionUser(u);
          setName(u.name || "");
          setMobileNumber(u.mobileNumber || "");
          setDepartment(u.department || "");
          setAvatar(u.avatar || "");
          setBio(u.bio || "");

          // Update local session
          const token = getAuthToken();
          if (token) setAuthSession(token, u);
        }
      })
      .catch((err) => {
        console.error("Failed to load profile:", err);
      })
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Save Profile Handler
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (!isPhoneValid) {
      setNotice({
        type: "error",
        message: "Please enter a valid mobile phone number for the selected country code.",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await authFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobileNumber,
          department,
          avatar,
          bio,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNotice({ type: "success", message: data.message || "Profile updated successfully." });
        const updatedUser = data.data as UserSession;
        setSessionUser(updatedUser);
        const token = getAuthToken();
        if (token) setAuthSession(token, updatedUser);

        // Notify other components (like header bar) via custom event
        window.dispatchEvent(new Event("profile-updated"));
      } else {
        setNotice({ type: "error", message: data.error || "Failed to update profile." });
      }
    } catch (err) {
      setNotice({ type: "error", message: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Password Change Handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (newPassword.length < 6) {
      setNotice({ type: "error", message: "New password must be at least 6 characters long." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ type: "error", message: "New password and confirmation do not match." });
      return;
    }

    setPwLoading(true);

    try {
      const res = await authFetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNotice({ type: "success", message: data.message || "Password updated successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setNotice({ type: "error", message: data.error || "Failed to update password." });
      }
    } catch (err) {
      setNotice({ type: "error", message: (err as Error).message });
    } finally {
      setPwLoading(false);
    }
  };

  // Custom Photo File Upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setNotice({ type: "error", message: "Image size must be under 5MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAvatar(String(event.target.result));
        setShowPhotoModal(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Password Strength calculation
  const getPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 2) return { label: "Weak", color: "bg-rose-500", text: "text-rose-600" };
    if (score <= 4) return { label: "Moderate", color: "bg-amber-500", text: "text-amber-600" };
    return { label: "Strong", color: "bg-emerald-500", text: "text-emerald-600" };
  };

  const pwStrength = getPasswordStrength(newPassword);

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* ── BREADCRUMB ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
        <span>Main menu</span>
        <ChevronRight size={12} />
        <span className="text-slate-600">Profile</span>
      </div>

      {/* ── HEADER USER CARD ────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_3px_15px_rgba(28,25,64,0.03)] flex flex-col md:flex-row items-center md:items-start gap-6">
        {/* Avatar with Upload button overlay */}
        <div className="relative group shrink-0">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-[#18476A]/20 bg-[#123955] shadow-md flex items-center justify-center text-white text-3xl font-bold">
            {avatar ? (
              <img src={avatar} alt={sessionUser?.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#123955] to-[#18476A] flex items-center justify-center text-white font-bold text-3xl">
                {sessionUser?.name ? sessionUser.name.charAt(0).toUpperCase() : "U"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            className="absolute -bottom-2 -right-2 p-2 rounded-xl bg-[#18476A] text-white hover:bg-[#123955] transition-all shadow-md hover:scale-105 border border-white"
            title="Update profile photo"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* User Bio & Info */}
        <div className="flex-1 text-center md:text-left space-y-2.5">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {sessionUser?.name || "User Profile"}
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getRoleBadgeStyle(
                sessionUser?.role || ""
              )}`}
            >
              <Shield className="w-3.5 h-3.5" />
              {sessionUser?.role || "Report Analyst"}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Account
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-y-1 gap-x-6 text-xs sm:text-sm text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-[#18476A]" />
              {sessionUser?.email || "user@nexora.com"}
            </span>
            {sessionUser?.mobileNumber && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-[#18476A]" />
                {sessionUser.mobileNumber}
              </span>
            )}
            {sessionUser?.department && (
              <span className="flex items-center gap-1.5">
                <Building className="w-4 h-4 text-[#18476A]" />
                {sessionUser.department}
              </span>
            )}
          </div>

          {sessionUser?.bio && (
            <p className="text-xs sm:text-sm text-slate-500 italic max-w-2xl pt-1">
              "{sessionUser.bio}"
            </p>
          )}
        </div>

        {/* Sync Button */}
        <button
          type="button"
          onClick={loadProfile}
          disabled={fetching}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#18476A] ${fetching ? "animate-spin" : ""}`} />
          Sync Profile
        </button>
      </div>

      {/* ── NOTIFICATION FEEDBACK BANNER ─────────────────────────────────── */}
      {notice && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs sm:text-sm transition-all animate-fadeIn ${
            notice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── PROFILE TAB NAVIGATION ──────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 gap-2 md:gap-4 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("details")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "details"
              ? "border-[#18476A] text-[#18476A] bg-[#18476A]/5 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <User className="w-4 h-4" />
          Personal Information
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "security"
              ? "border-[#18476A] text-[#18476A] bg-[#18476A]/5 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Lock className="w-4 h-4" />
          Security & Password
        </button>
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────────────────── */}
      {/* TAB 1: PERSONAL DETAILS */}
      {activeTab === "details" && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_3px_15px_rgba(28,25,64,0.03)] space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Personal Information</h2>
                <p className="text-xs text-slate-500">
                  Update your display name, contact phone, department, and bio.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-[#18476A] bg-[#eef6fa] px-3 py-1 rounded-full border border-[#bce0f2]">
                CRM ID: #{sessionUser?.email.split("@")[0]}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] outline-none transition"
                  />
                </div>
              </div>

              {/* Work Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span>Work Email Address</span>
                  <span className="text-[10px] text-emerald-600 font-bold">Verified Work Login</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="email"
                    value={sessionUser?.email || ""}
                    disabled
                    readOnly
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100/70 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Mobile Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Mobile / Phone Number
                </label>
                <CountryPhoneInput
                  value={mobileNumber}
                  onChange={setMobileNumber}
                  onValidChange={setIsPhoneValid}
                  defaultCountry="US"
                  placeholder="Enter phone number"
                />
              </div>

              {/* Department / Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Department / Job Title
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Risk & Compliance / Audit Supervisor"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] outline-none transition"
                  />
                </div>
              </div>

              {/* Assigned Role */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span>Assigned CRM Role</span>
                  <span className="text-[10px] text-slate-400">Managed by Workspace Admin</span>
                </label>
                <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#18476A]/10 text-[#18476A]">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{sessionUser?.role}</div>
                      <div className="text-xs text-slate-500">
                        Module access and dynamic permissions are automatically derived from this role.
                      </div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRoleBadgeStyle(sessionUser?.role || "")}`}>
                    {sessionUser?.role}
                  </span>
                </div>
              </div>

              {/* Bio / Work Summary */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Professional Bio / Notes
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Describe your role, responsibilities, or team notes..."
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] outline-none transition"
                />
              </div>
            </div>

            {/* Form submit button */}
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-[#18476A] px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-[#18476A]/20 hover:bg-[#123955] transition disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Check className="w-4 h-4 stroke-[3]" />
                )}
                Save Personal Details
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: SECURITY & PASSWORD */}
      {activeTab === "security" && (
        <form onSubmit={handleChangePassword} className="space-y-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_3px_15px_rgba(28,25,64,0.03)] space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Password & Security</h2>
              <p className="text-xs text-slate-500">
                Change your account password securely. Passwords are encrypted with bcrypt.
              </p>
            </div>

            <div className="max-w-xl space-y-5">
              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Current Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type={showCurrentPw ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-700"
                  >
                    {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type={showNewPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="At least 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-700"
                  >
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password strength meter */}
                {newPassword && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Password Strength</span>
                      <span className={`font-bold ${pwStrength.text}`}>{pwStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${pwStrength.color}`}
                        style={{
                          width:
                            pwStrength.label === "Weak"
                              ? "33%"
                              : pwStrength.label === "Moderate"
                              ? "66%"
                              : "100%",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Confirm New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-[#8fc3e0] focus:ring-2 focus:ring-[#dbeaf2] outline-none transition"
                  />
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-xs font-bold text-rose-500">Passwords do not match.</p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={pwLoading || !currentPassword || !newPassword || newPassword !== confirmPassword}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#18476A] px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-[#18476A]/20 hover:bg-[#123955] transition disabled:opacity-50"
                >
                  {pwLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── PHOTO SELECTION MODAL ───────────────────────────────────────────── */}
      {showPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Select Profile Photo</h3>
              <button
                onClick={() => setShowPhotoModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Avatar Library Presets */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Preset Avatars
              </label>
              <div className="grid grid-cols-3 gap-3">
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setAvatar(url);
                      setShowPhotoModal(false);
                    }}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-square ${
                      avatar === url ? "border-[#18476A] scale-95 shadow-md" : "border-slate-200 hover:border-[#8fc3e0]"
                    }`}
                  >
                    <img src={url} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Local File Upload */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Upload Custom Photo
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl border border-dashed border-[#18476A]/40 bg-[#18476A]/5 hover:bg-[#18476A]/10 text-[#18476A] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition"
              >
                <Camera className="w-4 h-4" />
                Upload Image File (JPG, PNG, WebP max 5MB)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
