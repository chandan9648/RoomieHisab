"use client";

import { ArrowRight, ReceiptText, Split, Wallet } from "lucide-react";

import { Alert, Button } from "./ui/primitives";

const HIGHLIGHTS = [
  { icon: ReceiptText, text: "Log a purchase in seconds, from the shop" },
  { icon: Split, text: "Everyone's share recalculated live" },
  { icon: ArrowRight, text: "Month end tells you exactly who pays whom" },
];

export function SignInScreen({
  onSignIn,
  signingIn,
  error,
  onDismissError,
}: {
  onSignIn: () => void;
  signingIn: boolean;
  error: string;
  onDismissError: () => void;
}) {
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

        <Button onClick={onSignIn} loading={signingIn} className="mt-7 w-full">
          Continue with Google
        </Button>

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
