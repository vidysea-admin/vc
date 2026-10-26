"use client";
import { useState, type FormEvent } from "react";
import { ErrorBanner } from "./ui";

export interface LoginViewProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  error: string | null;
  busy: boolean;
}

export function LoginView({ onSubmit, error, busy }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit(email.trim(), password);
  };
  return (
    <main className="adm-login">
      <form className="adm-card" onSubmit={submit} data-testid="login-form">
        <h1>Virtual Counsellor admin</h1>
        <p className="adm-note">Sign in with your admin account.</p>
        <ErrorBanner error={error} />
        <label className="adm-field">
          <span>Email</span>
          <input type="email" name="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} data-testid="login-email" />
        </label>
        <label className="adm-field">
          <span>Password</span>
          <input type="password" name="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} data-testid="login-password" />
        </label>
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy} data-testid="login-submit">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
