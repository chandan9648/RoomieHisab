"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import type { User } from "firebase/auth";

import { db } from "@/lib/firebase";
import { describeError, isPermissionDenied } from "@/lib/errors";
import { ensureProfile, expensesRef, householdRef, membersRef, profileRef } from "@/lib/households";
import type { Expense, Household, Member, UserProfile } from "@/lib/types";

export type HouseholdState = {
  /** True while we still do not know whether the user has a household. */
  loading: boolean;
  profile: UserProfile | null;
  household: Household | null;
  members: Member[];
  expenses: Expense[];
  error: string;
  /** True until the first expenses snapshot lands, for the list skeleton. */
  expensesLoading: boolean;
  /** Set when the active household rejected us, e.g. after being removed. */
  accessDenied: boolean;
  /** The signed-in user's own membership row, if any. */
  me: Member | null;
};

const EMPTY: HouseholdState = {
  loading: true,
  profile: null,
  household: null,
  members: [],
  expenses: [],
  error: "",
  expensesLoading: true,
  accessDenied: false,
  me: null,
};

/** Newest first, with a stable tiebreaker so equal dates do not jitter. */
function byRecency(a: Expense, b: Expense): number {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

/**
 * Subscribes to the signed-in user's profile and, through it, to the active
 * household's document, members and expenses. Every listener is torn down when
 * the user signs out or switches household, so no stale snapshot can arrive
 * after the component unmounts.
 */
export function useHousehold(user: User | null): HouseholdState {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [householdLoading, setHouseholdLoading] = useState(false);
  // Tracked separately so the dashboard does not flash "no members yet" in the
  // gap between the household document and the members snapshot arriving.
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [householdError, setHouseholdError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  // Profile listener. Watching rather than reading once means a household
  // switch made on another device shows up here immediately.
  useEffect(() => {
    if (!user || !db) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError("");
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    setProfileLoading(true);
    setProfileError("");

    (async () => {
      try {
        await ensureProfile(user);
      } catch (caught) {
        if (!cancelled) {
          setProfileError(describeError(caught));
          setProfileLoading(false);
        }
        return;
      }
      if (cancelled || !db) return;

      unsubscribe = onSnapshot(
        profileRef(db, user.uid),
        (snap) => {
          if (cancelled) return;
          setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
          setProfileLoading(false);
        },
        (caught) => {
          if (cancelled) return;
          setProfileError(describeError(caught));
          setProfileLoading(false);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user]);

  const activeId = profile?.householdId ?? null;

  // Household listeners, rebuilt whenever the active household changes.
  useEffect(() => {
    if (!user || !db || !activeId) {
      setHousehold(null);
      setMembers([]);
      setExpenses([]);
      setHouseholdLoading(false);
      setMembersLoaded(false);
      setExpensesLoaded(false);
      setHouseholdError("");
      setAccessDenied(false);
      return;
    }

    let cancelled = false;
    setHouseholdLoading(true);
    setMembersLoaded(false);
    setExpensesLoaded(false);
    setHouseholdError("");
    setAccessDenied(false);

    const fail = (caught: unknown) => {
      if (cancelled) return;
      if (isPermissionDenied(caught)) setAccessDenied(true);
      setHouseholdError(describeError(caught));
      // Released so an error surfaces instead of leaving a permanent spinner.
      setHouseholdLoading(false);
      setMembersLoaded(true);
      setExpensesLoaded(true);
    };

    const unsubHousehold = onSnapshot(
      householdRef(db, activeId),
      (snap) => {
        if (cancelled) return;
        setHousehold(snap.exists() ? ({ id: snap.id, ...snap.data() } as Household) : null);
        setHouseholdLoading(false);
      },
      fail,
    );

    const unsubMembers = onSnapshot(
      membersRef(db, activeId),
      (snap) => {
        if (cancelled) return;
        setMembers(snap.docs.map((d) => ({ ...(d.data() as Member), uid: d.id })));
        setMembersLoaded(true);
      },
      fail,
    );

    const unsubExpenses = onSnapshot(
      expensesRef(db, activeId),
      (snap) => {
        if (cancelled) return;
        setExpenses(
          snap.docs
            .map((d) => ({ ...(d.data() as Omit<Expense, "id">), id: d.id }))
            .sort(byRecency),
        );
        setExpensesLoaded(true);
      },
      fail,
    );

    return () => {
      cancelled = true;
      unsubHousehold();
      unsubMembers();
      unsubExpenses();
    };
  }, [user, activeId]);

  const me = useMemo(
    () => members.find((m) => m.uid === user?.uid) ?? null,
    [members, user?.uid],
  );

  if (!user) return EMPTY;

  return {
    loading: profileLoading || (Boolean(activeId) && (householdLoading || !membersLoaded)),
    profile,
    household,
    members,
    expenses,
    error: profileError || householdError,
    expensesLoading: Boolean(activeId) && !expensesLoaded,
    accessDenied,
    me,
  };
}
