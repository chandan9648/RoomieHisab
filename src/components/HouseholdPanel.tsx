"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Home,
  KeyRound,
  LogOut,
  RefreshCw,
  Repeat,
  Shield,
  ShieldOff,
  UserMinus,
  Users,
} from "lucide-react";

import {
  fetchHouseholdNames,
  leaveHousehold,
  removeMember,
  renameHousehold,
  rotateInviteCode,
  setMemberRole,
  switchHousehold,
} from "@/lib/households";
import { describeError } from "@/lib/errors";
import { formatInviteCode } from "@/lib/invite";
import { formatDateISO, todayISO } from "@/lib/dates";
import { LIMITS } from "@/lib/validation";
import type { Household, Member, UserProfile } from "@/lib/types";
import type { Confirmation } from "./ui/ConfirmDialog";

import { Alert, Avatar, Badge, Button, Card, CardHeader, Field, IconButton } from "./ui/primitives";

export function HouseholdPanel({
  household,
  members,
  me,
  profile,
  onNotice,
  onConfirm,
}: {
  household: Household;
  members: Member[];
  me: Member | null;
  profile: UserProfile | null;
  onNotice: (message: string) => void;
  onConfirm: (request: Confirmation) => void;
}) {
  const isAdmin = me?.role === "admin";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(household.name);
  const [otherNames, setOtherNames] = useState<Record<string, string>>({});

  const otherIds = (profile?.householdIds ?? []).filter((id) => id !== household.id);
  // A profile snapshot hands back a fresh array every time, so the effect below
  // keys off the contents rather than the array identity.
  const otherIdsKey = otherIds.join(",");

  // Keep the rename field in step when another admin renames the flat.
  useEffect(() => setName(household.name), [household.name]);

  useEffect(() => {
    if (!otherIdsKey) {
      setOtherNames({});
      return;
    }
    let cancelled = false;
    void fetchHouseholdNames(otherIdsKey.split(",")).then((names) => {
      if (!cancelled) setOtherNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [otherIdsKey]);

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await task();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy("");
    }
  }

  /**
   * The confirm-dialog variant of `run`. It deliberately does not catch: the
   * dialog shows the failure itself and stays open, which is the only place the
   * user is actually looking. Swallowing it here would close the dialog onto an
   * alert at the top of a panel they have scrolled past.
   */
  async function runConfirmed(key: string, task: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await task();
    } finally {
      setBusy("");
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the code is on screen to read out.
      setError("Could not copy automatically. The code is shown above.");
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert tone="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Invite code"
          subtitle="Anyone with this code can join and see your expenses"
          icon={<KeyRound size={18} aria-hidden />}
        />
        <div className="p-4 sm:p-5">
          <p className="tnum break-all rounded-xl bg-slate-900 px-4 py-4 text-center text-xl font-bold tracking-[0.2em] text-white sm:text-2xl">
            {formatInviteCode(household.inviteCode)}
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              onClick={() => void copyCode()}
              icon={copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
              className="sm:flex-1"
            >
              {copied ? "Copied" : "Copy code"}
            </Button>

            {isAdmin ? (
              <Button
                variant="secondary"
                loading={busy === "rotate"}
                icon={<RefreshCw size={16} aria-hidden />}
                className="sm:flex-1"
                onClick={() =>
                  onConfirm({
                    title: "Issue a new invite code?",
                    body: "The current code stops working immediately. Anyone you have already shared it with will not be able to join until you send them the new one.",
                    confirmLabel: "Issue new code",
                    onConfirm: () =>
                      runConfirmed("rotate", async () => {
                        if (!me) return;
                        await rotateInviteCode(household, me.uid);
                        onNotice("A new invite code is live. The old one no longer works.");
                      }),
                  })
                }
              >
                New code
              </Button>
            ) : null}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Codes are generated with 10 random characters from a 29-letter alphabet, and Firestore
            rules allow a lookup only of an exact code — the invite list itself cannot be browsed.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Roommates"
          subtitle={`${members.length} ${members.length === 1 ? "member" : "members"}`}
          icon={<Users size={18} aria-hidden />}
        />
        <ul className="divide-y divide-slate-100">
          {members.map((member) => {
            const isMe = member.uid === me?.uid;
            const isCreator = member.uid === household.createdBy;

            return (
              <li key={member.uid} className="flex items-center gap-3 p-4">
                <Avatar name={member.displayName} photoURL={member.photoURL} />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 flex-wrap items-center gap-2 font-semibold text-slate-900">
                    <span className="truncate">{member.displayName}</span>
                    {isMe ? <Badge tone="accent">You</Badge> : null}
                    {member.role === "admin" ? <Badge>Admin</Badge> : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {/* todayISO formats from local date parts, so a late-night
                        join does not display as the following day. */}
                    {member.email || "No email"} · joined{" "}
                    {formatDateISO(todayISO(new Date(member.joinedAt)))}
                  </p>
                </div>

                {/* The creator keeps admin rights so a flat can never be left
                    with nobody able to manage its invite code. */}
                {isAdmin && !isCreator ? (
                  <div className="flex shrink-0 items-center">
                    <IconButton
                      label={
                        member.role === "admin"
                          ? `Make ${member.displayName} a member`
                          : `Make ${member.displayName} an admin`
                      }
                      icon={
                        member.role === "admin" ? <ShieldOff size={16} /> : <Shield size={16} />
                      }
                      className="h-9 w-9"
                      disabled={busy === `role-${member.uid}`}
                      onClick={() =>
                        void run(`role-${member.uid}`, async () => {
                          const next = member.role === "admin" ? "member" : "admin";
                          await setMemberRole(household.id, member.uid, next);
                          onNotice(`${member.displayName} is now ${next === "admin" ? "an admin" : "a member"}.`);
                        })
                      }
                    />
                    {!isMe ? (
                      <IconButton
                        label={`Remove ${member.displayName}`}
                        icon={<UserMinus size={16} />}
                        className="h-9 w-9 text-rose-600 hover:bg-rose-50"
                        onClick={() =>
                          onConfirm({
                            title: `Remove ${member.displayName}?`,
                            body: "They lose access to this household immediately. Their past expenses stay in the history but are left out of future splits.",
                            confirmLabel: "Remove roommate",
                            onConfirm: () =>
                              runConfirmed(`remove-${member.uid}`, async () => {
                                await removeMember(household.id, member.uid);
                                onNotice(`${member.displayName} was removed.`);
                              }),
                          })
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader title="Flat name" icon={<Home size={18} aria-hidden />} />
          <form
            className="p-4 sm:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run("rename", async () => {
                await renameHousehold(household.id, name);
                onNotice("Flat name updated.");
              });
            }}
          >
            <Field id="rename-household" label="Name">
              {(props) => (
                <input
                  {...props}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={LIMITS.householdName}
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="secondary"
              loading={busy === "rename"}
              disabled={name.trim() === household.name}
              className="mt-3 w-full sm:w-auto"
            >
              Save name
            </Button>
          </form>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Switch household"
          subtitle="You stay a member of every flat you join"
          icon={<Repeat size={18} aria-hidden />}
        />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-slate-600">
            The dashboard shows one household at a time. Joining another flat with its invite code
            adds it here and makes it active — it never removes you from this one.
          </p>

          {otherIds.length > 0 ? (
            <div className="mt-3 space-y-2">
              {otherIds.map((id) => (
                <Button
                  key={id}
                  variant="secondary"
                  className="w-full justify-between"
                  loading={busy === `switch-${id}`}
                  disabled={!otherNames[id]}
                  onClick={() =>
                    void run(`switch-${id}`, async () => {
                      if (!me) return;
                      await switchHousehold(me.uid, id);
                    })
                  }
                >
                  <span className="truncate">{otherNames[id] ?? "Loading…"}</span>
                  <Repeat size={15} aria-hidden />
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              This is the only household you belong to.
            </p>
          )}
        </div>
      </Card>

      <Card className="border-rose-200">
        <CardHeader title="Leave household" icon={<LogOut size={18} aria-hidden />} />
        <div className="p-4 sm:p-5">
          <p className="text-sm text-slate-600">
            You will stop seeing this flat&apos;s expenses. Your past expenses stay in its history,
            and you can rejoin later with an invite code.
          </p>
          <Button
            variant="danger"
            className="mt-3 w-full sm:w-auto"
            loading={busy === "leave"}
            onClick={() =>
              onConfirm({
                title: `Leave ${household.name}?`,
                body:
                  household.createdBy === me?.uid && members.length > 1
                    ? "You created this household. Make another roommate an admin first, so someone can still manage the invite code."
                    : "You will lose access to these expenses until you rejoin with an invite code.",
                confirmLabel: "Leave household",
                onConfirm: () =>
                  runConfirmed("leave", async () => {
                    if (!me) return;
                    await leaveHousehold(
                      household,
                      me.uid,
                      members.length,
                      profile?.householdIds ?? [],
                    );
                    onNotice(`You left ${household.name}.`);
                  }),
              })
            }
          >
            Leave this household
          </Button>
        </div>
      </Card>
    </div>
  );
}
