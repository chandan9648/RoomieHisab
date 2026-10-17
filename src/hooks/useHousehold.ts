"use client";

import { useEffect, useMemo, useState } from "react";
import { getDoc, onSnapshot, type Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";

import { db } from "@/lib/firebase";
import { describeError, isPermissionDenied } from "@/lib/errors";
import {
  ensureProfile,
  expensesRef,
  householdRef,
  memberRef,
  membersRef,
  profileRef,
} from "@/lib/households";
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

/**
 * How many times a permission error may be treated as a passing auth problem
 * before it is taken at face value. Two retries covers a token that was still
 * being minted when the listeners attached, without leaving someone who really
 * was removed staring at a spinner.
 */
const MAX_RECOVERY_ATTEMPTS = 2;
const RECOVERY_DELAY_MS = 700;

/** Newest first, with a stable tiebreaker so equal dates do not jitter. */
function byRecency(a: Expense, b: Expense): number {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

type Membership = "member" | "removed" | "unknown";

/**
 * Settles whether a permission error really means "you were removed".
 *
 * Firestore returns `permission-denied` both for someone who has genuinely
 * lost access and for a listener that attached while the ID token was stale —
 * which happens on a slow phone, right after a sign-in, or when a backgrounded
 * tab wakes up. The two are indistinguishable at the listener, and a denied
 * listener is dead: Firestore never retries it. Taking the first denial at face
 * value is what puts "You no longer have access" in front of a member who is
 * still perfectly entitled to be there.
 *
 * Rules allow anyone signed in to read *their own* membership row whether or
 * not they are a member of that household, so the question can be asked
 * directly — after forcing a fresh token, which is the thing most likely to
 * have been wrong in the first place.
 */
async function confirmMembership(
  firestore: Firestore,
  user: User,
  householdId: string,
): Promise<Membership> {
  try {
    await user.getIdToken(true);
    const snap = await getDoc(memberRef(firestore, householdId, user.uid));
    return snap.exists() ? "member" : "removed";
  } catch {
    // Even this read failed, so the session rather than the membership is the
    // suspect. The caller retries instead of accusing the user of being removed.
    return "unknown";
  }
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
        try {
          await ensureProfile(user);
        } catch (caught) {
          // The same stale-token race as the household listeners below: the
          // first write after a sign-in can land before the token does.
          if (!isPermissionDenied(caught)) throw caught;
          await user.getIdToken(true).catch(() => undefined);
          if (cancelled) return;
          await ensureProfile(user);
        }
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
    const firestore = db;
    if (!user || !firestore || !activeId) {
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

    const householdId = activeId;
    let cancelled = false;
    let attempts = 0;
    let recovering = false;
    let unsubscribers: Array<() => void> = [];
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    setHouseholdLoading(true);
    setMembersLoaded(false);
    setExpensesLoaded(false);
    setHouseholdError("");
    setAccessDenied(false);

    const detach = () => {
      unsubscribers.forEach((off) => off());
      unsubscribers = [];
    };

    /** Reports the failure to the user and stops trying. */
    const settle = (caught: unknown) => {
      if (cancelled) return;
      if (isPermissionDenied(caught)) setAccessDenied(true);
      setHouseholdError(describeError(caught));
      // Released so an error surfaces instead of leaving a permanent spinner.
      setHouseholdLoading(false);
      setMembersLoaded(true);
      setExpensesLoaded(true);
    };

    const attach = () => {
      unsubscribers = [
        onSnapshot(
          householdRef(firestore, householdId),
          (snap) => {
            if (cancelled) return;
            setHousehold(snap.exists() ? ({ id: snap.id, ...snap.data() } as Household) : null);
            setHouseholdLoading(false);
          },
          fail,
        ),
        onSnapshot(
          membersRef(firestore, householdId),
          (snap) => {
            if (cancelled) return;
            setMembers(snap.docs.map((d) => ({ ...(d.data() as Member), uid: d.id })));
            setMembersLoaded(true);
          },
          fail,
        ),
        onSnapshot(
          expensesRef(firestore, householdId),
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
        ),
      ];
    };

    const recover = async (caught: unknown) => {
      // All three listeners come down: the denied one is already dead, and
      // re-attaching alongside the survivors would duplicate them.
      detach();
      attempts += 1;
      setHouseholdLoading(true);

      const membership = await confirmMembership(firestore, user, householdId);
      if (cancelled) return;

      if (membership === "removed") {
        settle(caught);
        return;
      }

      console.warn(
        `[household] permission denied on ${householdId} while membership reads ` +
          `"${membership}"; retrying (${attempts}/${MAX_RECOVERY_ATTEMPTS})`,
      );
      retryTimer = setTimeout(() => {
        if (!cancelled) attach();
      }, RECOVERY_DELAY_MS * attempts);
    };

    function fail(caught: unknown) {
      if (cancelled) return;
      if (!isPermissionDenied(caught) || attempts >= MAX_RECOVERY_ATTEMPTS) {
        settle(caught);
        return;
      }
      // The three listeners fail together; one recovery covers them all.
      if (recovering) return;
      recovering = true;
      void recover(caught).finally(() => {
        recovering = false;
      });
    }

    attach();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      detach();
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
