"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Lock, Command, Eye, EyeOff } from "lucide-react";
import { COMPANY } from "@/lib/config";

export default function ResetPasswordPage() {
  const [password,        setPassword]        = useState("");
  const [confirm,         setConfirm]         = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [done,            setDone]            = useState(false);
  const [sessionReady,    setSessionReady]    = useState(false);
  const router = useRouter();

  // Supabase sends the token in the URL hash — we need to let it load the session first
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 2500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117] px-4">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30">
              <Command className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <p className="text-lg font-bold text-white tracking-tight leading-tight">{COMPANY.name}</p>
              <p className="text-xs text-slate-500 leading-tight">{COMPANY.appName}</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Set new password</h1>
          <p className="text-sm text-slate-400">Choose a strong password for your account</p>
        </div>

        <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-6 shadow-xl space-y-5">

          {/* Done state */}
          {done ? (
            <div className="text-center space-y-3 py-2">
              <div className="text-4xl">✓</div>
              <p className="text-emerald-400 font-semibold text-sm">Password updated!</p>
              <p className="text-xs text-slate-400">Redirecting to dashboard...</p>
            </div>
          ) : !sessionReady ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-sm text-slate-400">Verifying your reset link...</p>
              <p className="text-xs text-slate-500">If nothing happens, the link may have expired. <button onClick={() => router.push("/login")} className="text-blue-400 hover:underline">Request a new one</button></p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-colors"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    className={`w-full rounded-lg border bg-white/5 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-colors ${
                      confirm && password !== confirm
                        ? "border-red-500/50 focus:ring-red-500/30"
                        : "border-white/10 focus:ring-blue-500/50 focus:border-blue-500/50"
                    }`}
                  />
                </div>
                {confirm && password !== confirm && (
                  <p className="text-xs text-red-400">Passwords don't match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !password || !confirm || password !== confirm}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/20 mt-2"
              >
                {loading ? "Updating..." : "Set New Password"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-600">{COMPANY.legal}</p>
      </div>
    </div>
  );
}