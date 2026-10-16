"use client";

/**
 * Shown when Firestore rejects reads for the active household — almost always
 * because an admin removed this user. Without this screen the dashboard would
 * sit on a permanent error with no way out.
 */

import { useState } from "react";
import { LogOut, ShieldAlert } from "lucide-react";

import { clearActiveHousehold } from "@/lib/households";
import { describeError } from "@/lib/errors";
import { Alert, Button } from "./ui/primitives";

export function AccessDeniedScreen({
  uid,
  message,
  onSignOut,
}: {
  uid: string;
  message: string;
  onSignOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reset() {
    setBusy(true);
    setError("");
    try {
      await clearActiveHousehold(uid);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <ShieldAlert size={24} aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          You no longer have access
        </h1>
        <p className="mt-2 text-slate-600">{message}</p>
        <p className="mt-2 text-sm text-slate-500">
          If this is a surprise, ask a roommate to send you a fresh invite code.
        </p>

        {error ? (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => void reset()} loading={busy}>
            Choose another household
          </Button>
          <Button variant="secondary" onClick={onSignOut} icon={<LogOut size={16} aria-hidden />}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
