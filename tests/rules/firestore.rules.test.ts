/**
 * Executable proof that `firestore.rules` does what the README claims.
 *
 * These run against the Firestore emulator — `npm run test:rules` starts it.
 * Every assertion is phrased as the thing an attacker or an honest user would
 * actually try, so a rule change that opens a hole fails a named test.
 */

import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "roomiehisab-rules-test";

const H1_CODE = "CODE123456";
const H2_CODE = "CODE999999";

let testEnv: RulesTestEnvironment;

/** A member document that satisfies `validMember`. */
const member = (uid: string, role: "admin" | "member", joinedVia = "") => ({
  uid,
  displayName: uid,
  email: `${uid}@example.com`,
  photoURL: null,
  joinedAt: 1,
  role,
  joinedVia,
});

/** An expense document that satisfies `validExpense`. */
const expense = (over: Record<string, unknown> = {}) => ({
  description: "Detergent",
  amountPaise: 1000,
  date: "2026-10-16",
  paidBy: "alice",
  payerName: "Alice",
  notes: "",
  createdAt: 1_700_000_000_000,
  ...over,
});

/**
 * `@firebase/rules-unit-testing` bundles Firestore typings from a different
 * Firebase major than the app's `firebase@11`. The instances are interchangeable
 * at runtime, so the cast is confined to this one helper instead of being
 * repeated at every assertion.
 */
const asDb = (instance: unknown): Firestore => instance as Firestore;

// Who is who: alice admins H1, bob is a plain member of H1, carol admins H2,
// dave belongs to nothing, and eve created H3 but has no member row yet.
const as = (uid: string): Firestore => asDb(testEnv.authenticatedContext(uid).firestore());
const anon = (): Firestore => asDb(testEnv.unauthenticatedContext().firestore());

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = asDb(ctx.firestore());

    await setDoc(doc(db, "households/H1"), {
      name: "Flat One",
      createdBy: "alice",
      inviteCode: H1_CODE,
      createdAt: 1,
    });
    await setDoc(doc(db, "households/H1/members/alice"), member("alice", "admin"));
    await setDoc(doc(db, "households/H1/members/bob"), member("bob", "member", H1_CODE));
    await setDoc(doc(db, "households/H1/expenses/e1"), expense());
    await setDoc(doc(db, "households/H1/expenses/e2"), expense({ paidBy: "bob", payerName: "bob" }));
    await setDoc(doc(db, "invites/" + H1_CODE), {
      code: H1_CODE,
      householdId: "H1",
      householdName: "Flat One",
      createdBy: "alice",
      createdAt: 1,
    });

    await setDoc(doc(db, "households/H2"), {
      name: "Flat Two",
      createdBy: "carol",
      inviteCode: H2_CODE,
      createdAt: 1,
    });
    await setDoc(doc(db, "households/H2/members/carol"), member("carol", "admin"));
    await setDoc(doc(db, "invites/" + H2_CODE), {
      code: H2_CODE,
      householdId: "H2",
      householdName: "Flat Two",
      createdBy: "carol",
      createdAt: 1,
    });

    // Created but not yet bootstrapped, as it exists between the two writes of
    // `createHousehold`.
    await setDoc(doc(db, "households/H3"), {
      name: "Flat Three",
      createdBy: "eve",
      inviteCode: "CODE555555",
      createdAt: 1,
    });

    await setDoc(doc(db, "users/alice"), {
      uid: "alice",
      displayName: "alice",
      email: "a@x.com",
      photoURL: null,
      householdId: "H1",
      householdIds: ["H1"],
    });
  });
});

describe("user profiles", () => {
  it("lets a user read and write their own profile", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice")));
    await assertSucceeds(
      setDoc(doc(as("alice"), "users/alice"), { householdId: "H1" }, { merge: true }),
    );
  });

  it("lets a brand-new user read the gap and create their own profile", async () => {
    // The exact first-sign-in path in `ensureProfile`: read a profile that does
    // not exist yet, then write it. dave has no seeded `users/dave` document.
    const snap = await assertSucceeds(getDoc(doc(as("dave"), "users/dave")));
    expect(snap.exists()).toBe(false);
    await assertSucceeds(
      setDoc(doc(as("dave"), "users/dave"), {
        uid: "dave",
        displayName: "Dave",
        email: "dave@example.com",
        photoURL: null,
        householdId: null,
        householdIds: [],
      }),
    );
  });

  it("hides one user's profile from another", async () => {
    await assertFails(getDoc(doc(as("bob"), "users/alice")));
    await assertFails(setDoc(doc(as("bob"), "users/alice"), { householdId: "H9" }));
  });

  it("cannot be listed, so the user base is not enumerable", async () => {
    await assertFails(getDocs(collection(as("alice"), "users")));
  });

  it("rejects an unauthenticated read", async () => {
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });
});

describe("households", () => {
  it("is readable by its own members", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "households/H1")));
    await assertSucceeds(getDoc(doc(as("bob"), "households/H1")));
  });

  it("is not readable by a non-member or a member of another flat", async () => {
    await assertFails(getDoc(doc(as("dave"), "households/H1")));
    await assertFails(getDoc(doc(as("carol"), "households/H1")));
    await assertFails(getDoc(doc(anon(), "households/H1")));
  });

  it("can never be listed, so flats cannot be discovered by query", async () => {
    // This is the rule that makes "query households by inviteCode" impossible,
    // and the reason invite codes live in their own collection.
    await assertFails(getDocs(collection(as("alice"), "households")));
    await assertFails(getDocs(collection(as("dave"), "households")));
  });

  it("can be created only with yourself as creator", async () => {
    const valid = { name: "New Flat", createdBy: "dave", inviteCode: "CODE777777", createdAt: 2 };
    await assertSucceeds(setDoc(doc(as("dave"), "households/HNEW"), valid));
    await assertFails(
      setDoc(doc(as("dave"), "households/HFAKE"), { ...valid, createdBy: "alice" }),
    );
  });

  it("rejects a malformed or over-long household name", async () => {
    const base = { createdBy: "dave", inviteCode: "CODE777777", createdAt: 2 };
    await assertFails(setDoc(doc(as("dave"), "households/HBAD"), { ...base, name: "" }));
    await assertFails(setDoc(doc(as("dave"), "households/HBAD"), { ...base, name: "x".repeat(61) }));
    await assertFails(setDoc(doc(as("dave"), "households/HBAD"), { ...base, name: 42 }));
  });

  it("lets an admin rename the flat and rotate the code", async () => {
    await assertSucceeds(updateDoc(doc(as("alice"), "households/H1"), { name: "Renamed" }));
    await assertSucceeds(
      updateDoc(doc(as("alice"), "households/H1"), { inviteCode: "CODE222222" }),
    );
  });

  it("stops a plain member renaming the flat", async () => {
    await assertFails(updateDoc(doc(as("bob"), "households/H1"), { name: "Bob's Flat" }));
  });

  it("makes creator and creation time immutable", async () => {
    await assertFails(updateDoc(doc(as("alice"), "households/H1"), { createdBy: "bob" }));
    await assertFails(updateDoc(doc(as("alice"), "households/H1"), { createdAt: 999 }));
  });

  it("rejects an unknown field being smuggled in", async () => {
    await assertFails(updateDoc(doc(as("alice"), "households/H1"), { isPremium: true }));
  });

  it("lets only the creator delete the household", async () => {
    await assertFails(deleteDoc(doc(as("bob"), "households/H1")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "households/H1")));
  });
});

describe("invites", () => {
  it("lets any signed-in user redeem a code they were given", async () => {
    const snap = await assertSucceeds(getDoc(doc(as("dave"), "invites/" + H1_CODE)));
    expect(snap.data()?.householdId).toBe("H1");
    // Only the flat's name is exposed — the same thing the inviter would say.
    expect(Object.keys(snap.data() ?? {}).sort()).toEqual([
      "code",
      "createdAt",
      "createdBy",
      "householdId",
      "householdName",
    ]);
  });

  it("refuses an unauthenticated lookup", async () => {
    await assertFails(getDoc(doc(anon(), "invites/" + H1_CODE)));
  });

  it("can never be listed, so codes cannot be harvested", async () => {
    await assertFails(getDocs(collection(as("dave"), "invites")));
    await assertFails(getDocs(collection(as("alice"), "invites")));
  });

  it("lets an admin issue a code for their own household", async () => {
    await assertSucceeds(
      setDoc(doc(as("alice"), "invites/CODE111111"), {
        code: "CODE111111",
        householdId: "H1",
        householdName: "Flat One",
        createdBy: "alice",
        createdAt: 2,
      }),
    );
  });

  it("lets the creator mint the first code before their member row exists", async () => {
    // This is the exact shape of the second write in `createHousehold`: the
    // member row and the invite are in one batch, so a batched write cannot see
    // the member row it is itself creating. Authorisation has to come from the
    // household's `createdBy` instead, and this test is what proves it does.
    await assertSucceeds(
      setDoc(doc(as("eve"), "invites/CODE555555"), {
        code: "CODE555555",
        householdId: "H3",
        householdName: "Flat Three",
        createdBy: "eve",
        createdAt: 2,
      }),
    );
  });

  it("stops a non-creator minting a code for a flat with no members yet", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "invites/CODE555555"), {
        code: "CODE555555",
        householdId: "H3",
        householdName: "Flat Three",
        createdBy: "dave",
        createdAt: 2,
      }),
    );
  });

  it("stops a stranger minting a code for a flat they are not in", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "invites/CODE111111"), {
        code: "CODE111111",
        householdId: "H1",
        householdName: "Flat One",
        createdBy: "dave",
        createdAt: 2,
      }),
    );
  });

  it("stops a plain member minting a code", async () => {
    await assertFails(
      setDoc(doc(as("bob"), "invites/CODE111111"), {
        code: "CODE111111",
        householdId: "H1",
        householdName: "Flat One",
        createdBy: "bob",
        createdAt: 2,
      }),
    );
  });

  it("requires the document id and the code field to agree", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "invites/CODE111111"), {
        code: "SOMETHINGELSE",
        householdId: "H1",
        householdName: "Flat One",
        createdBy: "alice",
        createdAt: 2,
      }),
    );
  });

  it("can never be repointed at another household", async () => {
    // Rotation is create-new + delete-old; in-place update is denied outright.
    await assertFails(updateDoc(doc(as("alice"), "invites/" + H1_CODE), { householdId: "H2" }));
    await assertFails(updateDoc(doc(as("carol"), "invites/" + H1_CODE), { householdId: "H2" }));
  });

  it("lets an admin revoke their own code but nobody else's", async () => {
    await assertFails(deleteDoc(doc(as("dave"), "invites/" + H1_CODE)));
    await assertFails(deleteDoc(doc(as("carol"), "invites/" + H1_CODE)));
    await assertSucceeds(deleteDoc(doc(as("alice"), "invites/" + H1_CODE)));
  });
});

describe("members", () => {
  it("is readable by members of the same household only", async () => {
    await assertSucceeds(getDocs(collection(as("bob"), "households/H1/members")));
    await assertFails(getDocs(collection(as("dave"), "households/H1/members")));
    await assertFails(getDocs(collection(as("carol"), "households/H1/members")));
  });

  it("lets anyone check their own membership row in a flat they are not in", async () => {
    // The join flow asks "am I already in here?" before redeeming a code. If
    // that question is itself a permission error, a first-time join fails
    // before it starts, which is exactly what used to happen.
    await assertSucceeds(getDoc(doc(as("dave"), "households/H1/members/dave")));
  });

  it("still hides other people's rows from a non-member", async () => {
    await assertFails(getDoc(doc(as("dave"), "households/H1/members/alice")));
    await assertFails(getDoc(doc(as("carol"), "households/H1/members/bob")));
  });

  it("lets a stranger join by presenting a valid code for that household", async () => {
    await assertSucceeds(
      setDoc(doc(as("dave"), "households/H1/members/dave"), member("dave", "member", H1_CODE)),
    );
  });

  it("allows the whole join as `joinHouseholdByCode` actually performs it", async () => {
    // Every step of the real flow, in order and as the same user: resolve the
    // code, check your own membership, then write the member row and the
    // profile in one batch. Each piece is asserted elsewhere; this is the one
    // that fails if the sequence as a whole regresses.
    const db = as("dave");

    await assertSucceeds(getDoc(doc(db, "invites/" + H1_CODE)));
    await assertSucceeds(getDoc(doc(db, "households/H1/members/dave")));

    const batch = writeBatch(db);
    batch.set(doc(db, "households/H1/members/dave"), member("dave", "member", H1_CODE));
    batch.set(
      doc(db, "users/dave"),
      { uid: "dave", householdId: "H1", householdIds: ["H1"] },
      { merge: true },
    );
    await assertSucceeds(batch.commit());

    // And the flat is readable only once that membership row exists.
    await assertSucceeds(getDoc(doc(db, "households/H1")));
  });

  it("refuses to let a joiner make themselves an admin", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "households/H1/members/dave"), member("dave", "admin", H1_CODE)),
    );
  });

  it("refuses a join with no code at all", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "households/H1/members/dave"), member("dave", "member", "")),
    );
  });

  it("refuses a join with a code that belongs to a different household", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "households/H1/members/dave"), member("dave", "member", H2_CODE)),
    );
  });

  it("refuses a join with a code that does not exist", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "households/H1/members/dave"), member("dave", "member", "NOSUCHCODE")),
    );
  });

  it("refuses a join after the code has been revoked", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(asDb(ctx.firestore()), "invites/" + H1_CODE));
    });
    await assertFails(
      setDoc(doc(as("dave"), "households/H1/members/dave"), member("dave", "member", H1_CODE)),
    );
  });

  it("stops anyone creating a membership row for someone else", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "households/H1/members/frank"), member("frank", "member", H1_CODE)),
    );
  });

  it("lets a household creator bootstrap their own admin row", async () => {
    await assertSucceeds(
      setDoc(doc(as("eve"), "households/H3/members/eve"), member("eve", "admin")),
    );
  });

  it("stops a non-creator claiming the admin bootstrap path", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "households/H3/members/dave"), member("dave", "admin")),
    );
  });

  it("stops a member promoting themselves", async () => {
    await assertFails(updateDoc(doc(as("bob"), "households/H1/members/bob"), { role: "admin" }));
  });

  it("lets an admin change roles", async () => {
    await assertSucceeds(
      updateDoc(doc(as("alice"), "households/H1/members/bob"), { role: "admin" }),
    );
  });

  it("keeps join metadata immutable", async () => {
    await assertFails(updateDoc(doc(as("bob"), "households/H1/members/bob"), { joinedAt: 999 }));
    await assertFails(
      updateDoc(doc(as("alice"), "households/H1/members/bob"), { joinedVia: "CODE222222" }),
    );
  });

  it("lets a member leave, and an admin remove someone", async () => {
    await assertSucceeds(deleteDoc(doc(as("bob"), "households/H1/members/bob")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "households/H1/members/bob")));
  });

  it("stops a plain member removing a roommate", async () => {
    await assertFails(deleteDoc(doc(as("bob"), "households/H1/members/alice")));
  });
});

describe("expenses", () => {
  it("is readable only by members of that household", async () => {
    await assertSucceeds(getDocs(collection(as("bob"), "households/H1/expenses")));
    await assertFails(getDocs(collection(as("dave"), "households/H1/expenses")));
    await assertFails(getDocs(collection(as("carol"), "households/H1/expenses")));
    await assertFails(getDocs(collection(anon(), "households/H1/expenses")));
  });

  it("lets a member log their own spending", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("bob"), "households/H1/expenses/new1"),
        expense({ paidBy: "bob", payerName: "bob" }),
      ),
    );
  });

  it("stops a member attributing an expense to a roommate", async () => {
    await assertFails(
      setDoc(doc(as("bob"), "households/H1/expenses/new2"), expense({ paidBy: "alice" })),
    );
  });

  it("lets an admin log an expense on a roommate's behalf", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("alice"), "households/H1/expenses/new3"),
        expense({ paidBy: "bob", payerName: "bob" }),
      ),
    );
  });

  it("stops a non-member writing anything", async () => {
    await assertFails(
      setDoc(doc(as("dave"), "households/H1/expenses/new4"), expense({ paidBy: "dave" })),
    );
  });

  it("requires the payer to be a current member", async () => {
    await assertFails(
      setDoc(
        doc(as("alice"), "households/H1/expenses/new5"),
        expense({ paidBy: "ghost", payerName: "ghost" }),
      ),
    );
  });

  it.each([
    ["a negative amount", { amountPaise: -500 }],
    ["a zero amount", { amountPaise: 0 }],
    ["a fractional amount", { amountPaise: 10.5 }],
    ["an amount above the cap", { amountPaise: 1_000_000_001 }],
    ["an amount sent as a string", { amountPaise: "1000" }],
    ["an empty description", { description: "" }],
    ["an over-long description", { description: "x".repeat(81) }],
    ["over-long notes", { notes: "x".repeat(201) }],
    ["a malformed date", { date: "16/10/2026" }],
    ["a partial date", { date: "2026-10" }],
    ["a missing field", { notes: undefined }],
  ])("rejects %s", async (_label, override) => {
    const data = expense(override as Record<string, unknown>);
    if ("notes" in override && override.notes === undefined) delete (data as { notes?: unknown }).notes;
    await assertFails(setDoc(doc(as("alice"), "households/H1/expenses/bad"), data));
  });

  it("rejects an unknown extra field", async () => {
    await assertFails(
      setDoc(
        doc(as("alice"), "households/H1/expenses/bad2"),
        expense({ settledBy: "alice" }),
      ),
    );
  });

  it("lets the payer correct their own expense", async () => {
    await assertSucceeds(
      setDoc(doc(as("alice"), "households/H1/expenses/e1"), expense({ amountPaise: 2000 })),
    );
  });

  it("stops another member editing someone else's expense", async () => {
    await assertFails(
      setDoc(doc(as("bob"), "households/H1/expenses/e1"), expense({ amountPaise: 1 })),
    );
  });

  it("lets an admin edit a roommate's expense", async () => {
    await assertSucceeds(
      setDoc(
        doc(as("alice"), "households/H1/expenses/e2"),
        expense({ paidBy: "bob", payerName: "bob", amountPaise: 5000 }),
      ),
    );
  });

  it("refuses to reassign an expense to a different payer", async () => {
    await assertFails(
      setDoc(
        doc(as("alice"), "households/H1/expenses/e1"),
        expense({ paidBy: "bob", payerName: "bob" }),
      ),
    );
  });

  it("refuses to rewrite createdAt", async () => {
    await assertFails(
      setDoc(doc(as("alice"), "households/H1/expenses/e1"), expense({ createdAt: 1 })),
    );
  });

  it("lets the payer or an admin delete, and nobody else", async () => {
    await assertFails(deleteDoc(doc(as("dave"), "households/H1/expenses/e1")));
    await assertFails(deleteDoc(doc(as("bob"), "households/H1/expenses/e1")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "households/H1/expenses/e1")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "households/H1/expenses/e2")));
  });

  it("lets the payer delete their own expense", async () => {
    await assertSucceeds(deleteDoc(doc(as("bob"), "households/H1/expenses/e2")));
  });
});
