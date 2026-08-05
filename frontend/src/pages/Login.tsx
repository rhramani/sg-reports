import { FormEvent, useState } from "react";
import { BarChart3, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LoginResponse } from "@shared/api";
import { setAuthSession } from "@/lib/apiClient";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");          // general / account errors
  const [emailError, setEmailError] = useState(""); // email field–specific
  const [passwordError, setPasswordError] = useState(""); // password field–specific
  const [successMsg, setSuccessMsg] = useState(""); // success banner
  const [loading, setLoading] = useState(false);

  /** Clear all error states */
  const clearErrors = () => {
    setError("");
    setEmailError("");
    setPasswordError("");
    setSuccessMsg("");
  };

  const performLogin = async (loginEmail: string, loginPass: string) => {
    clearErrors();

    if (!loginEmail.trim()) {
      setEmailError("Please enter your work email.");
      return;
    }
    if (!loginPass.trim()) {
      setPasswordError("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPass.trim() }),
      });

      const data: LoginResponse = await res.json();

      if (data.success && data.token && data.user) {
        // ── Login successful ──────────────────────────────────────
        setSuccessMsg(data.message || "Login successful.");
        setAuthSession(data.token, data.user);
        // Brief delay to show success message before redirect
        setTimeout(() => navigate("/", { replace: true }), 700);
      } else {
        // ── Route error to the correct field ─────────────────────
        const msg = data.error || "Authentication failed. Please check your credentials.";
        if (data.field === "email") {
          setEmailError(msg);
        } else if (data.field === "password") {
          setPasswordError(msg);
        } else {
          setError(msg);
        }
      }
    } catch {
      setError("Unable to connect to the authentication server. Please verify the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    performLogin(email, password);
  };

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-slate-900 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#18476A] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#18476A]/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full bg-[#18476A]/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#6fa6c4] shadow-lg shadow-teal-950/30">
            <BarChart3 size={20} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight">Nexora</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#b4d4e4]/60">
              Intelligence Suite
            </p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#8fc3e0]">
            Enterprise report intelligence
          </p>
          <h1 className="text-5xl font-bold leading-[1.08] tracking-[-0.04em] xl:text-6xl">
            Make every report a <span className="text-[#8fc3e0]">clearer decision.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-white/55">
            Bring dynamic operational data, approvals, and teams together in one calm, intelligent
            workspace.
          </p>
        </div>
        <p className="relative text-[10px] text-white/30">
          © 2026 Nexora Intelligence Suite · Secure workspace access
        </p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#18476A] text-white">
              <BarChart3 size={20} />
            </div>
            <div>
              <p className="text-base font-bold">Nexora</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#18476A]">
                Intelligence Suite
              </p>
            </div>
          </div>
          <div className="mb-6">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#18476A]">
              Welcome back
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">
              Sign in to your workspace
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Manage reports, approvals, and team operations securely.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* ── Email field ───────────────────────────────────── */}
            <div className="block">
              <span className="text-xs font-bold text-slate-700">Work email</span>
              <div className="relative mt-2">
                <Mail
                  size={17}
                  className={`absolute left-3.5 top-3.5 ${emailError ? "text-rose-400" : "text-slate-400"}`}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setEmailError(""); }}
                  className={`h-12 w-full rounded-xl border bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-300 focus:ring-4 ${
                    emailError
                      ? "border-rose-400 focus:border-rose-400 focus:ring-rose-100"
                      : "border-slate-200 focus:border-[#6fa6c4] focus:ring-[#dbeaf2]"
                  }`}
                  placeholder="you@company.com"
                />
              </div>
              {emailError && (
                <p className="mt-1.5 text-xs font-medium text-rose-600">{emailError}</p>
              )}
            </div>

            {/* ── Password field ────────────────────────────────── */}
            <div className="block">
              <span className="text-xs font-bold text-slate-700">Password</span>
              <div className="relative mt-2">
                <LockKeyhole
                  size={17}
                  className={`absolute left-3.5 top-3.5 ${passwordError ? "text-rose-400" : "text-slate-400"}`}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setPasswordError(""); }}
                  className={`h-12 w-full rounded-xl border bg-white pl-11 pr-11 text-sm outline-none transition placeholder:text-slate-300 focus:ring-4 ${
                    passwordError
                      ? "border-rose-400 focus:border-rose-400 focus:ring-rose-100"
                      : "border-slate-200 focus:border-[#6fa6c4] focus:ring-[#dbeaf2]"
                  }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {passwordError && (
                <p className="mt-1.5 text-xs font-medium text-rose-600">{passwordError}</p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" defaultChecked className="h-3.5 w-3.5 accent-[#18476A]" />
                Remember me
              </label>
              <button
                type="button"
                onClick={() =>
                  setError("Please contact your workspace administrator to reset your password.")
                }
                className="text-xs font-semibold text-[#18476A] hover:text-[#18476A]"
              >
                Forgot password?
              </button>
            </div>
            {/* ── Success banner ────────────────────────────── */}
            {successMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                <p className="text-xs font-medium text-emerald-700">{successMsg}</p>
              </div>
            )}

            {/* ── General error banner ──────────────────────── */}
            {error && (
              <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs font-medium text-rose-600">
                {error}
              </p>
            )}

            <button
              disabled={loading || Boolean(successMsg)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] text-sm font-bold text-white shadow-lg shadow-[#b4d4e4] transition hover:bg-[#18476A] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? "Signing you in..." : successMsg ? "Redirecting..." : "Sign in to Nexora"}
            </button>
          </form>
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-[11px] leading-relaxed text-slate-500">
              <span className="font-bold text-slate-700">Secure workspace</span>
              <br />
              Your access is protected by role-based permissions and workspace security controls.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
