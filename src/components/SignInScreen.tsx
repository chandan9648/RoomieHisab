"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ReceiptText, Split, Wallet } from "lucide-react";

import { Alert, Button } from "./ui/primitives";

const HIGHLIGHTS = [
  { icon: ReceiptText, text: "Log a purchase in seconds, from the shop" },
  { icon: Split, text: "Everyone's share recalculated live" },
  { icon: ArrowRight, text: "Month end tells you exactly who pays whom" },
];

/**
 * How long a sign-in may run before we say something about it. Long enough not
 * to nag during a normal Google round trip on a phone.
 */
const SLOW_SIGN_IN_MS = 20_000;

export function SignInScreen({
  onSignIn,
  signingIn,
  error,
  onDismissError,
  embeddedBrowser = false,
}: {
  onSignIn: () => void;
  signingIn: boolean;
  error: string;
  onDismissError: () => void;
  /** True in an app's in-app browser, where Google refuses OAuth outright. */
  embeddedBrowser?: boolean;
}) {
  const [slow, setSlow] = useState(false);

  // A popup that was dismissed by the OS, or a tab the browser froze, leaves
  // the sign-in promise pending forever. Rather than call that a failure —
  // the sign-in may still be completing — the wait is simply acknowledged.
  useEffect(() => {
    if (!signingIn) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_SIGN_IN_MS);
    return () => clearTimeout(timer);
  }, [signingIn]);

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600 text-white">
          <Wallet size={28} aria-hidden />
        </span>

        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-600">ROOMIEHISAB</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Flat ka hisaab, settled.
        </h1>
        <p className="mt-3 leading-relaxed text-slate-600">
          Replace the notebook on the fridge. Track shared shopping together and see a fair
          settlement the moment anyone adds an expense.
        </p>

        <ul className="mt-6 space-y-3">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-slate-700">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon size={15} aria-hidden />
              </span>
              {text}
            </li>
          ))}
        </ul>

        {embeddedBrowser ? (
          <div className="mt-6">
            <Alert tone="warning">
              You opened this from inside another app. Google blocks sign-in in app browsers — tap
              the ⋯ menu and choose “Open in browser”, then continue in Chrome or Safari.
            </Alert>
          </div>
        ) : null}

        <Button onClick={onSignIn} loading={signingIn} className="mt-7 w-full">
          Continue with Google
        </Button>

        {signingIn && slow ? (
          <p className="mt-3 text-center text-xs leading-relaxed text-slate-500">
            Still waiting for Google. If the sign-in window closed before you finished, tap the
            button again once it is free.
          </p>
        ) : null}

        {error ? (
          <div className="mt-4">
            <Alert tone="error" onDismiss={onDismissError}>
              {error}
            </Alert>
          </div>
        ) : null}

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Your household data is readable only by members of that household, enforced by Firestore
          security rules.
        </p>
      </div>
    </main>
  );
}
