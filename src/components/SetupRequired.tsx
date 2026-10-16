/**
 * Shown when `.env.local` has no Firebase web config. Without this the app
 * would fail with an opaque Firebase error on first render.
 */

import { Wallet } from "lucide-react";

const KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

export function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-white">
          <Wallet size={24} aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Finish setting up RoomieHisab</h1>
        <p className="mt-2 text-slate-600">
          Copy <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">.env.example</code> to{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">.env.local</code> and paste in
          your Firebase web app configuration, then restart the dev server.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">
          {KEYS.map((key) => `${key}=…`).join("\n")}
        </pre>
        <p className="mt-4 text-sm text-slate-500">
          These values are the public web config, not secrets. Access is enforced by{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">firestore.rules</code>. See the README
          for the full walkthrough.
        </p>
      </div>
    </main>
  );
}
