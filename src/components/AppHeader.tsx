"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Check, Copy, LogOut, Wallet } from "lucide-react";

import { formatInviteCode } from "@/lib/invite";
import type { Household } from "@/lib/types";
import { Avatar, Button, IconButton } from "./ui/primitives";

export function AppHeader({
  household,
  user,
  onSignOut,
  onCopied,
}: {
  household: Household;
  user: User;
  onSignOut: () => void;
  onCopied: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(household.inviteCode);
      setCopied(true);
      onCopied("Invite code copied. Share it only with your roommates.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopied(`Copy failed. The code is ${formatInviteCode(household.inviteCode)}.`);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 sm:gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">
          <Wallet size={20} aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight tracking-tight text-slate-900">
            {household.name}
          </p>
          <p className="truncate text-xs text-slate-500">RoomieHisab · live</p>
        </div>

        {/*
          Capped and truncated rather than left to size itself: the code is a
          long unbroken string, and a header item that refuses to shrink is what
          pushes the flat name out of the row and the page sideways on a phone.
        */}
        <Button
          variant="secondary"
          onClick={() => void copyCode()}
          icon={copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          className="tnum hidden min-w-0 max-w-[14rem] shrink px-3 text-xs sm:inline-flex"
        >
          <span className="truncate font-mono tracking-wider">
            {formatInviteCode(household.inviteCode)}
          </span>
        </Button>

        <IconButton
          label="Copy invite code"
          icon={copied ? <Check size={18} /> : <Copy size={18} />}
          variant="secondary"
          className="sm:hidden"
          onClick={() => void copyCode()}
        />

        <span className="hidden sm:block">
          <Avatar name={user.displayName ?? user.email ?? "You"} photoURL={user.photoURL} size={36} />
        </span>

        <IconButton label="Sign out" icon={<LogOut size={18} />} onClick={onSignOut} />
      </div>
    </header>
  );
}
