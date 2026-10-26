"use client";

import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { liveConfigured, supabase } from "@/lib/supabase";
import { translate } from "@/lib/i18n/runtime";

/**
 * Who is using the app.
 *   live  = signed in with a real account: real companies, real data (where a screen is connected)
 *   demo  = the sample companies on built-in data (client presentations, exploring without an account)
 * Without the live settings the app is always in demo mode, exactly as it was before sign-in existed.
 */
export type AuthStatus = "loading" | "signedOut" | "live" | "demo";

interface AuthContextValue {
  status: AuthStatus;
  /** True when sign-in is available at all (the live settings are present). */
  liveAvailable: boolean;
  email: string | null;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Create a sign-in. Someone invited by email joins their company the first time they sign in with that address. */
  signUp: (email: string, password: string, fullName: string) => Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; message: string }>;
  /** Email a link that lets the person choose a new password. */
  sendPasswordReset: (email: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Set a new password for the signed-in (or just-recovered) person. */
  changePassword: (newPassword: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => Promise<void>;
  startDemo: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);
const DEMO_KEY = "propiq-demo";

/** Supabase's English error text, put the way we would say it to a property dealer (in the language on screen). */
function friendlyAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return translate("auth.err.invalid");
  if (m.includes("email not confirmed")) return translate("auth.err.notConfirmed");
  if (m.includes("already registered") || m.includes("already been registered")) return translate("auth.err.exists");
  if (m.includes("password") && (m.includes("least") || m.includes("weak") || m.includes("short"))) return translate("auth.err.weak");
  if (m.includes("rate limit") || m.includes("too many")) return translate("auth.err.rateLimit");
  if (m.includes("fetch") || m.includes("network")) return translate("auth.err.network");
  return translate("auth.err.generic");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // without the live settings there is nothing to wait for: demo straight away (no loading flash)
  const [status, setStatus] = React.useState<AuthStatus>(liveConfigured ? "loading" : "demo");
  const [session, setSession] = React.useState<Session | null>(null);

  React.useEffect(() => {
    if (!liveConfigured) {
      // Nothing to sign in to: demo only.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("demo");
      return;
    }
    let active = true;
    const sb = supabase();
    const demo = () => {
      try {
        return window.localStorage.getItem(DEMO_KEY) === "1";
      } catch {
        return false;
      }
    };
    void sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus(data.session ? "live" : demo() ? "demo" : "signedOut");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? "live" : demo() ? "demo" : "signedOut");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = React.useCallback<AuthContextValue["signIn"]>(async (email, password) => {
    try {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, message: friendlyAuthError(error.message) };
      try {
        window.localStorage.removeItem(DEMO_KEY);
      } catch {
        /* private mode: nothing to clear */
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, message: friendlyAuthError(e instanceof Error ? e.message : "") };
    }
  }, []);

  const signUp = React.useCallback<AuthContextValue["signUp"]>(async (email, password, fullName) => {
    try {
      const { data, error } = await supabase().auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
      if (error) return { ok: false, message: friendlyAuthError(error.message) };
      return { ok: true, needsConfirmation: !data.session };
    } catch (e) {
      return { ok: false, message: friendlyAuthError(e instanceof Error ? e.message : "") };
    }
  }, []);

  const sendPasswordReset = React.useCallback<AuthContextValue["sendPasswordReset"]>(async (email) => {
    try {
      const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (error) return { ok: false, message: friendlyAuthError(error.message) };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: friendlyAuthError(e instanceof Error ? e.message : "") };
    }
  }, []);

  const changePassword = React.useCallback<AuthContextValue["changePassword"]>(async (newPassword) => {
    try {
      const { error } = await supabase().auth.updateUser({ password: newPassword });
      if (error) return { ok: false, message: friendlyAuthError(error.message) };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: friendlyAuthError(e instanceof Error ? e.message : "") };
    }
  }, []);

  const signOut = React.useCallback(async () => {
    try {
      window.localStorage.removeItem(DEMO_KEY);
    } catch {
      /* ignore */
    }
    if (liveConfigured) await supabase().auth.signOut();
    setSession(null);
    setStatus(liveConfigured ? "signedOut" : "demo");
  }, []);

  const startDemo = React.useCallback(() => {
    try {
      window.localStorage.setItem(DEMO_KEY, "1");
    } catch {
      /* ignore */
    }
    setStatus("demo");
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ status, liveAvailable: liveConfigured, email: session?.user.email ?? null, signIn, signUp, sendPasswordReset, changePassword, signOut, startDemo }),
    [status, session, signIn, signUp, sendPasswordReset, changePassword, signOut, startDemo],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
