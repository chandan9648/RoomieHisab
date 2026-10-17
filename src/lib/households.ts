/**
 * All household mutations live here so the components stay presentational and
 * every write has exactly one definition that matches `firestore.rules`.
 *
 * ## Why there is an `invites` collection
 * The obvious way to join a household is to query
 * `households where inviteCode == X`. That cannot be secured: a `list` on
 * `households` is either open to strangers (leaking every flat name) or closed
 * to non-members (making joining impossible). Instead each code gets its own
 * `invites/{CODE}` document. Rules allow `get` on an exact code and never
 * `list`, so a code can be redeemed by whoever was given it, while the
 * `households` collection stays readable only by its own members.
 */

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { User } from "firebase/auth";

import { requireFirebase } from "./firebase";
import { isPermissionDenied, withTimeout } from "./errors";
import { generateInviteCode, normaliseInviteCode } from "./invite";
import { safeMemberName, validateHouseholdName } from "./validation";
import type { Household, Invite, Member, UserProfile } from "./types";

export const householdRef = (db: Firestore, id: string) => doc(db, "households", id);
export const membersRef = (db: Firestore, id: string) => collection(db, "households", id, "members");
export const memberRef = (db: Firestore, id: string, uid: string) =>
  doc(db, "households", id, "members", uid);
export const expensesRef = (db: Firestore, id: string) =>
  collection(db, "households", id, "expenses");
export const expenseRef = (db: Firestore, id: string, expenseId: string) =>
  doc(db, "households", id, "expenses", expenseId);
export const profileRef = (db: Firestore, uid: string) => doc(db, "users", uid);
export const inviteRef = (db: Firestore, code: string) => doc(db, "invites", code);

/** The profile fields refreshed from the Google account on every sign-in. */
function identity(user: User) {
  return {
    uid: user.uid,
    displayName: safeMemberName(user.displayName, user.email ?? "Roommate"),
    email: user.email ?? "",
    photoURL: user.photoURL ?? null,
  };
}

/**
 * Creates the user profile document if this is their first sign-in, so
 * `users/{uid}` always exists before any household work.
 */
export async function ensureProfile(user: User): Promise<UserProfile> {
  const { db } = requireFirebase();
  const ref = profileRef(db, user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile: UserProfile = { ...identity(user), householdId: null, householdIds: [] };
    await withTimeout(setDoc(ref, profile), "create your profile");
    return profile;
  }

  // Keep the display name and avatar in step with the Google account without
  // disturbing household membership.
  await withTimeout(setDoc(ref, identity(user), { merge: true }), "refresh your profile");
  return { ...(snap.data() as UserProfile), ...identity(user) };
}

/**
 * Creates a household, its first (admin) member and its invite code.
 *
 * This runs as two writes rather than one batch on purpose: rules authorise the
 * member and invite documents by reading the household `createdBy` field, and a
 * batched write cannot see its own uncommitted documents. If the second write
 * fails the household is left empty and unreferenced, which is invisible to
 * everyone; the caller simply retries.
 */
export async function createHousehold(user: User, rawName: string): Promise<Household> {
  const { db } = requireFirebase();
  const name = validateHouseholdName(rawName);
  if (!name.ok) throw new Error(name.error);

  const ref = doc(collection(db, "households"));
  const inviteCode = generateInviteCode();
  const createdAt = Date.now();

  await withTimeout(
    setDoc(ref, { name: name.value, createdBy: user.uid, inviteCode, createdAt }),
    "create the household",
  );

  const member: Member = {
    ...identity(user),
    joinedAt: createdAt,
    role: "admin",
    joinedVia: "",
  };
  const invite: Invite = {
    code: inviteCode,
    householdId: ref.id,
    householdName: name.value,
    createdBy: user.uid,
    createdAt,
  };

  const batch = writeBatch(db);
  batch.set(memberRef(db, ref.id, user.uid), member);
  batch.set(inviteRef(db, inviteCode), invite);
  batch.set(
    profileRef(db, user.uid),
    { ...identity(user), householdId: ref.id, householdIds: arrayUnion(ref.id) },
    { merge: true },
  );
  await withTimeout(batch.commit(), "set up the household");

  return { id: ref.id, name: name.value, createdBy: user.uid, inviteCode, createdAt };
}

/** Resolves a typed code to its invite, or null when no such code exists. */
export async function lookupInvite(rawCode: string): Promise<Invite | null> {
  const { db } = requireFirebase();
  const code = normaliseInviteCode(rawCode);
  if (!code) return null;

  const snap = await getDoc(inviteRef(db, code));
  return snap.exists() ? (snap.data() as Invite) : null;
}

/**
 * True when the caller already has a membership row in this household.
 *
 * Firestore refuses a `get` the rules do not allow whether or not the document
 * exists, and reading a household's members requires being one. For the person
 * this function exists to serve — somebody redeeming an invite for a flat they
 * have never been in — the read is therefore *denied*, not empty. Treating that
 * denial as an error is what made every first-time join fail with "You do not
 * have permission for that" before the join was even attempted.
 */
async function alreadyJoined(db: Firestore, householdId: string, uid: string): Promise<boolean> {
  try {
    const snap = await getDoc(memberRef(db, householdId, uid));
    return snap.exists();
  } catch (caught) {
    if (isPermissionDenied(caught)) return false;
    throw caught;
  }
}

export type JoinResult = { householdId: string; householdName: string; alreadyMember: boolean };

/**
 * Redeems an invite code. Joining an extra household never removes the user
 * from the ones they are already in: it is appended to `householdIds` and
 * becomes the active `householdId`, so switching back later is a profile
 * update rather than a re-join.
 */
export async function joinHouseholdByCode(user: User, rawCode: string): Promise<JoinResult> {
  const { db } = requireFirebase();
  const code = normaliseInviteCode(rawCode);
  const invite = await lookupInvite(code);
  if (!invite) throw new Error("That invite code does not exist. Check it with your roommate.");

  if (await alreadyJoined(db, invite.householdId, user.uid)) {
    // Already in this flat, so make it the active one rather than failing.
    await withTimeout(
      setDoc(
        profileRef(db, user.uid),
        { householdId: invite.householdId, householdIds: arrayUnion(invite.householdId) },
        { merge: true },
      ),
      "switch to that household",
    );
    return {
      householdId: invite.householdId,
      householdName: invite.householdName,
      alreadyMember: true,
    };
  }

  const member: Member = {
    ...identity(user),
    joinedAt: Date.now(),
    role: "member",
    joinedVia: code,
  };

  const batch = writeBatch(db);
  batch.set(memberRef(db, invite.householdId, user.uid), member);
  batch.set(
    profileRef(db, user.uid),
    {
      ...identity(user),
      householdId: invite.householdId,
      householdIds: arrayUnion(invite.householdId),
    },
    { merge: true },
  );
  await withTimeout(batch.commit(), "join the household");

  return {
    householdId: invite.householdId,
    householdName: invite.householdName,
    alreadyMember: false,
  };
}

/** Points the dashboard at another household the user already belongs to. */
export async function switchHousehold(uid: string, householdId: string): Promise<void> {
  const { db } = requireFirebase();
  await withTimeout(
    setDoc(
      profileRef(db, uid),
      { householdId, householdIds: arrayUnion(householdId) },
      { merge: true },
    ),
    "switch household",
  );
}

/**
 * Clears the active household without leaving it, which is how the UI recovers
 * when the current household has been deleted or access was revoked.
 */
export async function clearActiveHousehold(uid: string): Promise<void> {
  const { db } = requireFirebase();
  await withTimeout(
    setDoc(profileRef(db, uid), { householdId: null }, { merge: true }),
    "clear the active household",
  );
}

export async function renameHousehold(householdId: string, rawName: string): Promise<void> {
  const { db } = requireFirebase();
  const name = validateHouseholdName(rawName);
  if (!name.ok) throw new Error(name.error);
  await withTimeout(
    updateDoc(householdRef(db, householdId), { name: name.value }),
    "rename the household",
  );
}

/**
 * Issues a fresh code and deletes the old one, which immediately stops anyone
 * holding it from joining. Admins only, enforced by rules.
 */
export async function rotateInviteCode(household: Household, uid: string): Promise<string> {
  const { db } = requireFirebase();
  const code = generateInviteCode();
  const invite: Invite = {
    code,
    householdId: household.id,
    householdName: household.name,
    createdBy: uid,
    createdAt: Date.now(),
  };

  const batch = writeBatch(db);
  batch.set(inviteRef(db, code), invite);
  batch.update(householdRef(db, household.id), { inviteCode: code });
  await withTimeout(batch.commit(), "issue a new invite code");

  // Deleted only after the new code is live, so a failure here can never leave
  // the household with no usable invite at all.
  if (household.inviteCode && household.inviteCode !== code) {
    await deleteDoc(inviteRef(db, household.inviteCode)).catch(() => {
      /* A stale invite row is harmless once the household stops pointing at it. */
    });
  }
  return code;
}

/**
 * Removes the user from a household. The creator cannot walk away while other
 * roommates remain, because nobody else could then manage the invite code.
 */
export async function leaveHousehold(
  household: Household,
  uid: string,
  memberCount: number,
  joinedHouseholdIds: string[],
): Promise<string | null> {
  const { db } = requireFirebase();
  if (household.createdBy === uid && memberCount > 1) {
    throw new Error("Make another roommate an admin before you leave this household.");
  }

  const nextActive = joinedHouseholdIds.find((id) => id !== household.id) ?? null;
  const batch = writeBatch(db);
  batch.delete(memberRef(db, household.id, uid));
  batch.set(
    profileRef(db, uid),
    { householdId: nextActive, householdIds: arrayRemove(household.id) },
    { merge: true },
  );
  await withTimeout(batch.commit(), "leave the household");
  return nextActive;
}

/** Promotes or demotes a roommate. Admins only, enforced by rules. */
export async function setMemberRole(
  householdId: string,
  memberUid: string,
  role: Member["role"],
): Promise<void> {
  const { db } = requireFirebase();
  await withTimeout(
    updateDoc(memberRef(db, householdId, memberUid), { role }),
    "change that role",
  );
}

/**
 * Removes a roommate from the household. Admins only, enforced by rules.
 *
 * Their past expenses are deliberately left in place so the history of what the
 * flat actually spent stays intact; the settlement engine reports them as
 * belonging to a former member and leaves them out of the split.
 */
export async function removeMember(householdId: string, memberUid: string): Promise<void> {
  const { db } = requireFirebase();
  await withTimeout(
    deleteDoc(memberRef(db, householdId, memberUid)),
    "remove that roommate",
  );
}

/**
 * Reads the names of the households a user belongs to, for the switcher.
 * Membership is required for each read, so a stale id simply resolves to null.
 */
export async function fetchHouseholdNames(ids: string[]): Promise<Record<string, string>> {
  const { db } = requireFirebase();
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(householdRef(db, id));
        return [id, snap.exists() ? ((snap.data() as Household).name ?? id) : ""] as const;
      } catch {
        // A household we can no longer read is simply not offered.
        return [id, ""] as const;
      }
    }),
  );
  return Object.fromEntries(entries.filter(([, name]) => name));
}
