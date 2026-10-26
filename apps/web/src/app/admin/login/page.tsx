"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginView } from "../_components/LoginView";
import { LoginError, useSession } from "../_lib/session";

export default function LoginPage() {
  const { status, login } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A valid session (cookie re-validated on load) skips the form.
  useEffect(() => {
    if (status === "authenticated") router.replace("/admin/dashboard");
  }, [status, router]);

  const onSubmit = async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof LoginError ? e.message : "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return <LoginView onSubmit={onSubmit} error={error} busy={busy} />;
}
