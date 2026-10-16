"use client";

import { useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { Home, LogOut, Search, UserPlus } from "lucide-react";

import { createHousehold, joinHouseholdByCode, lookupInvite, switchHousehold } from "@/lib/households";
import { INVITE_CODE_LENGTH, isPlausibleInviteCode, normaliseInviteCode } from "@/lib/invite";
import { describeError } from "@/lib/errors";
import { LIMITS } from "@/lib/validation";
import type { UserProfile } from "@/lib/types";

import { Alert, Button, Card, Field, IconButton } from "./ui/primitives";

export function OnboardingScreen({
  user,
  profile,
  /**
   * A failure from the profile listener. Without showing it here, a backend
   * that cannot be reached looks like a perfectly normal "you have no
   * household yet" screen, and the first write is the only hint something is
   * wrong.
   */
  loadError,
  onSignOut,
}: {
  user: User;
  profile: UserProfile | null;
  loadError?: string;
  onSignOut: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | "check" | null>(null);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [codeError, setCodeError] = useState("");
  const [preview, setPreview] = useState("");

  // Someone who left their last household still has it in `householdIds`, so
  // offer a way back in without needing the invite code again.
  const rejoinable = (profile?.householdIds ?? []).filter(Boolean);

  async function run(kind: "create" | "join" | "check", task: () => Promise<void>) {
    setBusy(kind);
    setError("");
    try {
      await task();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    setNameError("");
    if (!name.trim()) {
      setNameError("Give your flat a name.");
      return;
    }
    void run("create", async () => {
      await createHousehold(user, name);
    });
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    setCodeError("");
    if (!isPlausibleInviteCode(code)) {
      setCodeError("Invite codes are 6–10 letters and digits.");
      return;
    }
    void run("join", async () => {
      await joinHouseholdByCode(user, code);
    });
  }

  function handleCheck() {
    setCodeError("");
    setPreview("");
    if (!isPlausibleInviteCode(code)) {
      setCodeError("Invite codes are 6–10 letters and digits.");
      return;
    }
    void run("check", async () => {
      const invite = await lookupInvite(code);
      if (!invite) {
        setCodeError("No household uses that code.");
        return;
      }
      setPreview(invite.householdName);
    });
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-indigo-600">ROOMIEHISAB</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Set up your flat
            </h1>
            <p className="mt-1 truncate text-sm text-slate-500">
              Signed in as {user.displayName || user.email}
            </p>
          </div>
          <IconButton label="Sign out" icon={<LogOut size={18} />} onClick={onSignOut} />
        </div>

        {loadError && !error ? (
          <div className="mb-4">
            <Alert tone="error">{loadError}</Alert>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4">
            <Alert tone="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          </div>
        ) : null}

        {rejoinable.length > 0 ? (
          <Card className="mb-4 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Rejoin a household</h2>
            <p className="mt-1 text-sm text-slate-500">
              You are still a member of {rejoinable.length === 1 ? "a household" : "these households"}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rejoinable.map((id) => (
                <Button
                  key={id}
                  variant="secondary"
                  onClick={() => void run("join", () => switchHousehold(user.uid, id))}
                >
                  Open {id.slice(0, 6)}…
                </Button>
              ))}
            </div>
          </Card>
        ) : null}

        <Card as="div" className="p-4 sm:p-5">
          <form onSubmit={handleCreate} noValidate>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <Home size={18} aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Create a household</h2>
                <p className="text-sm text-slate-500">You will be its admin.</p>
              </div>
            </div>

            <Field
              id="household-name"
              label="Flat name"
              error={nameError}
              hint="Something your roommates will recognise."
              className="mt-4"
            >
              {(props) => (
                <input
                  {...props}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError("");
                  }}
                  placeholder="Gomti Nagar Flat"
                  maxLength={LIMITS.householdName}
                  autoComplete="off"
                />
              )}
            </Field>

            <Button type="submit" loading={busy === "create"} className="mt-4 w-full">
              Create household
            </Button>
          </form>
        </Card>

        <div className="my-4 flex items-center gap-3 text-xs font-medium text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          OR
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <Card as="div" className="p-4 sm:p-5">
          <form onSubmit={handleJoin} noValidate>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <UserPlus size={18} aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Join with an invite code</h2>
                <p className="text-sm text-slate-500">Ask a roommate for the flat code.</p>
              </div>
            </div>

            <Field id="invite-code" label="Invite code" error={codeError} className="mt-4">
              {(props) => (
                <input
                  {...props}
                  value={code}
                  onChange={(e) => {
                    setCode(normaliseInviteCode(e.target.value));
                    setCodeError("");
                    setPreview("");
                  }}
                  placeholder="ABCD-234-XYZ"
                  // Hyphens are allowed in and stripped out, so the printed
                  // grouping can be typed in as-is.
                  maxLength={INVITE_CODE_LENGTH + 3}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${props.className} font-mono tracking-[0.18em] uppercase`}
                />
              )}
            </Field>

            {preview ? (
              <p className="mt-2 text-sm font-medium text-emerald-700">
                That code opens <span className="font-semibold">{preview}</span>.
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                onClick={handleCheck}
                loading={busy === "check"}
                icon={<Search size={16} aria-hidden />}
                className="sm:flex-1"
              >
                Check code
              </Button>
              <Button type="submit" loading={busy === "join"} className="sm:flex-1">
                Join household
              </Button>
            </div>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
          An invite code is a credential: anyone who has it can join and see this flat&apos;s
          expenses. Admins can issue a new code at any time, which revokes the old one.
        </p>
      </div>
    </main>
  );
}
