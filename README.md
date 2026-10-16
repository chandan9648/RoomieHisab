# RoomieHisab

A mobile-first shared expense tracker for flatmates. Everyone logs what they
bought, and the dashboard shows live totals, each person's fair share, and the
exact set of payments needed to settle up — for a chosen month or for all time.

Built with Next.js (App Router), TypeScript in strict mode, Tailwind CSS,
Firebase Authentication (Google) and Cloud Firestore. Deploys to Vercel.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then paste in your Firebase web config
npm run dev                    # http://localhost:3000
```

Without `.env.local` the app renders a setup screen instead of failing with an
opaque Firebase error.

## Scripts

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Dev server with hot reload                     |
| `npm run build`    | Production build                               |
| `npm start`        | Serve the production build                     |
| `npm run lint`     | ESLint (`next/core-web-vitals`, `next/typescript`) |
| `npm run typecheck`| `tsc --noEmit`                                 |
| `npm test`         | Vitest unit tests (no emulator needed)         |
| `npm run test:watch` | Vitest in watch mode                         |
| `npm run test:rules` | Security-rules tests against the Firestore emulator |
| `npm run test:all` | Unit tests, then rules tests                   |

---

## Firebase setup

1. **Create a project** at <https://console.firebase.google.com>.

2. **Enable Google sign-in.** Authentication → Sign-in method → Google →
   Enable. Set a support email.

3. **Authorise your domains.** Authentication → Settings → Authorised domains.
   `localhost` is there by default; add your Vercel domain
   (`your-app.vercel.app`) plus any custom domain before going live, or sign-in
   fails with `auth/unauthorized-domain`.

4. **Create a Firestore database.** Firestore Database → Create database →
   Production mode, then pick a region (`asia-south1` for India).

5. **Register a web app.** Project settings → General → Your apps → Web. Copy
   the config values into `.env.local` using the names in `.env.example`.

6. **Deploy the security rules.** The rules in `firestore.rules` are not
   optional — they are the only thing protecting household data. Either paste
   the file into Firestore Database → Rules → Publish, or use the CLI:

   ```bash
   npm i -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules
   ```

No composite indexes are needed: the app subscribes to whole subcollections and
filters by month on the client, which is cheap at a flat's volume of data.

### Environment variables

All six are required, and all are public browser config:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

A Firebase web API key is an identifier, not a credential — it cannot be used to
read data that the rules forbid. **Admin SDK service-account keys are a
different matter and must never appear in this repo or in any `NEXT_PUBLIC_*`
variable.**

## Deploying to Vercel

1. Push the repo to GitHub and import it at <https://vercel.com/new>. The
   defaults (`next build`, no root directory override) are correct.
2. Add all six `NEXT_PUBLIC_FIREBASE_*` variables under Settings → Environment
   Variables, for Production, Preview and Development.
3. Deploy, then add the resulting domain to Firebase's authorised domains
   (step 3 above). Preview deployments get their own URLs, so either add them or
   expect sign-in to fail there.

---

## Data model

```
users/{uid}                              UserProfile
  displayName, email, photoURL
  householdId        -> the household currently on screen (nullable)
  householdIds[]     -> every household joined, for switching

invites/{CODE}                           Invite
  code, householdId, householdName, createdBy, createdAt

households/{householdId}                 Household
  name, createdBy, inviteCode, createdAt

  members/{uid}                          Member
    displayName, email, photoURL, joinedAt
    role          -> "admin" | "member"
    joinedVia     -> the invite code redeemed ("" for the creator)

  expenses/{expenseId}                   Expense
    description, amountPaise, date, paidBy, payerName, notes, createdAt
```

### Money is always integer paise

`amountPaise` is an integer: `1050` means ₹10.50. Sums and splits are computed
entirely in paise and converted to rupees only for display, via
`Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`. Typed
amounts are parsed by `parseAmountToPaise` rather than `Number(x) * 100`, so
`0.07` becomes exactly `7` paise instead of `7.000000000000001`.

### Dates are local calendar days

`date` is a plain `"YYYY-MM-DD"` string in the user's local time, never a UTC
timestamp. An expense added at 11pm IST stays on the day the thing was actually
bought.

### Household switching

A user can belong to any number of households. `householdIds` holds all of
them; `householdId` is the one the dashboard is showing. Joining another flat
with its invite code **appends** to the list and makes the new flat active — it
never removes you from the previous one. Switch between them under the **Flat**
tab. Leaving a household removes your `members` row and drops it from
`householdIds`, but your past expenses stay in that flat's history.

The creator of a household cannot leave while other roommates remain, since
nobody else would be able to manage the invite code. Promote another member to
admin first.

---

## Settlement algorithm

Pure, integer-only and dependency-free, in `src/lib/settlements.ts`:

1. `total` = sum of eligible expenses in the selected period.
2. `share = total / memberCount` — split equally among all active members.
3. `net = paid - share` for each member. Positive means they should **receive**
   money, negative means they **owe** money.
4. Debtors are matched greedily against creditors, largest against largest,
   until every net is zero. Each pass fully clears at least one person, so at
   most `memberCount - 1` transfers are produced. Nobody is ever told to pay
   themselves.

Examples:

| Input                                  | Result                              |
| -------------------------------------- | ----------------------------------- |
| Chandan ₹50, Shyam ₹20                 | Shyam sends ₹15 to Chandan          |
| A ₹90, B ₹0, C ₹0                      | B sends ₹30 to A; C sends ₹30 to A  |

### How rounding residuals are handled

₹70.00 split three ways is 7000 / 3 = 2333.33… paise, which no real set of
payments can match. Rather than let a third of a paise drift into the transfers,
the **shares absorb it**:

```
base      = floor(total / memberCount)      // 2333 paise each
remainder = total - base * memberCount      // 1 paise left over
```

The remainder is handed out as one extra paise each to the first `remainder`
members in a stable order (ascending uid). So one member may be charged exactly
one paise more than another, and in exchange:

- `sum(shares) === total` exactly,
- `sum(nets) === 0` exactly,
- total outgoing transfers always equal total incoming transfers,
- no transfer is ever generated for less than one paise.

The UI explains this inline whenever a residual exists. `evenSharePaise` is the
pre-residual figure shown as "fair share"; `sharePaise` on each balance is the
exact amount charged.

Expenses paid by someone who has since left the household are **excluded** from
the split — counting them would stop the nets summing to zero — and reported
separately so the money is not silently lost.

### Month-end accounting

A month selector defaults to the current month, and the settlement is computed
from the selected period only. Nothing is ever deleted when a month rolls over;
the selector lists every month that has data, plus an **All time** option, so
history stays reachable forever.

---

## Security model

`firestore.rules` is the enforcement point. Highlights:

- Nothing is readable or writable without an authenticated user.
- Every household read and write re-checks membership via
  `exists(households/{id}/members/{uid})`. Membership is never inferred from the
  client's `users/{uid}` document.
- `households` and `invites` deny `list` entirely, so neither collection can be
  queried or scraped. They can only be fetched by exact id.
- Writes are shape-validated server-side as well as in the forms: amounts must
  be positive integers within a cap, dates must match `YYYY-MM-DD`, text lengths
  are bounded, and `paidBy` must be a current member.
- Only the payer of an expense, or a household admin, can edit or delete it.
  Payer and `createdAt` are immutable on update, so an expense can be corrected
  but never reassigned to someone else.
- A joining member always gets `role: "member"`; a role cannot be self-assigned.
  Only the household creator may create the initial `admin` row.

### Why invite codes get their own collection

The natural way to join a household is to query
`households where inviteCode == X`. That cannot be secured — a `list` on
`households` is either open to strangers (leaking every flat's name) or closed to
non-members (making joining impossible, which is the bug this starter shipped
with).

Instead, each code is its own document at `invites/{CODE}`. Rules allow `get` on
an exact code and never `list`. A prospective member resolves their code to a
household id without `households` ever becoming queryable.

Codes are treated as join credentials:

- 10 characters from a 29-letter alphabet (≈ 4.2 × 10¹⁴ combinations, about 48
  bits), generated with `crypto.getRandomValues`, never `Math.random`.
- The alphabet omits characters people confuse out loud (`0/O`, `1/I/L`, `U/V`).
- Admins can issue a new code at any time; the old document is deleted, which
  revokes it immediately.
- `invites/{CODE}` exposes only the household's name — the same thing the person
  inviting you would say out loud. Expenses and member lists stay unreachable
  until you are actually a member.

An invite doc can never be repointed at another household: rotation is
"create the new one, delete the old one", and `update` is denied outright.

### A note on atomicity

Creating a household is two writes rather than one batch, because rules
authorise the member and invite documents by reading the household's
`createdBy` field, and a batched write cannot see its own uncommitted documents.
If the second write fails, the household is left empty and unreferenced —
invisible to everyone — and the user simply retries. A Cloud Function would
remove even that window, at the cost of requiring the Blaze plan; it is the
natural next step if this grows beyond a flat-sized app.

---

## Project structure

```
src/
  app/
    layout.tsx           metadata + viewport
    page.tsx             routes between setup / sign-in / onboarding / dashboard
    globals.css          design tokens, focus styles, safe-area handling
  components/
    Dashboard.tsx        orchestrates tabs, month filter, modals
    AppHeader.tsx        household name, invite copy, sign out
    navigation.tsx       one tab definition for bottom nav + segmented control
    SummaryCards.tsx     total / paid / share / net
    MemberBalances.tsx   per-roommate paid, share, net, progress
    ExpenseList.tsx      history with edit + delete affordances
    ExpenseFormModal.tsx add and edit, with per-field validation
    SettlementPanel.tsx  "you send" / "you receive" + all transfers
    HouseholdPanel.tsx   invite code, roles, switching, leaving
    MonthPicker.tsx      month-end filter
    SignInScreen.tsx  OnboardingScreen.tsx  AccessDeniedScreen.tsx  SetupRequired.tsx
    ui/                  primitives, Modal, ConfirmDialog
  hooks/
    useAuth.ts           Google sign-in and session state
    useHousehold.ts      profile + household + members + expenses listeners
  lib/
    settlements.ts       pure settlement engine (unit tested)
    money.ts dates.ts validation.ts   pure helpers (unit tested)
    expenses.ts households.ts         Firestore writes
    firebase.ts errors.ts invite.ts types.ts
firestore.rules
```

Every Firestore listener is created in a `useEffect` and torn down in its
cleanup, with a `cancelled` flag so a late snapshot cannot write to an unmounted
component.

## Tests

```bash
npm test          # 92 unit tests, pure functions, no emulator
npm run test:rules  # 65 security-rules tests against the Firestore emulator
npm run test:all    # both
```

### Unit tests (92)

The settlement engine is covered for 2-member, 3-member and 5-member
households, zero-spend members, single-member households, expenses from former
members, rounding residuals for every member count from 2 to 11, sub-paise
amounts, float-precision traps, and order independence. Every case also asserts
the conservation invariants: shares sum to the total, nets sum to zero, and
outgoing transfers equal incoming transfers exactly.

The paise parser, month filtering, invite-code generation and expense draft
validation are covered too.

### Security-rules tests (65)

`tests/rules/firestore.rules.test.ts` runs the real rules against the Firestore
emulator, so the security claims above are executable rather than asserted. It
requires the Firebase CLI and a JDK; `npm run test:rules` starts and stops the
emulator for you.

Each test is phrased as something an attacker or an honest user would actually
try, including: a non-member reading a household, listing `households` or
`invites`, a joiner trying to make themselves an admin, joining with a revoked
or wrong-household code, creating a membership row for someone else, a member
editing a roommate's expense, reassigning an expense to another payer, rewriting
`createdAt`, repointing an invite at another household, and every field-level
validation (negative, zero, fractional, over-cap, string and missing amounts,
malformed dates, over-long text, unknown extra fields).

It also pins the one non-obvious authorisation path: during `createHousehold`
the member row and the invite are written in a single batch, so rules cannot see
the member row being created and must authorise from the household's `createdBy`
instead. If that ever regresses, creating a household breaks — so there is a
test named for it.

## Accessibility and mobile

- Works from 320px upwards with no horizontal scrolling.
- Tap targets are at least 44px; bottom navigation plus a floating add button.
- Labels are tied to inputs by id, with `aria-invalid` and `aria-describedby`
  wiring error text to the field it belongs to.
- Dialogs trap focus, close on Escape, restore focus to the trigger, and lock
  background scroll. Deletion always goes through a confirmation dialog.
- `prefers-reduced-motion` is honoured; pinch-zoom is not blocked.
- Loading, empty, error and permission-denied states are handled explicitly
  rather than left blank.

## Troubleshooting

**A button spins forever and no error appears.** Almost always: the Firebase
project has no Cloud Firestore database, or the browser cannot reach
`firestore.googleapis.com`.

Firestore is offline-first for writes: `setDoc` resolves only when the *server*
acknowledges the write, and if the backend is unreachable the SDK queues it and
retries indefinitely. The promise never settles and never rejects. Reads behave
differently — they reject — so the symptom is a silent failure on load followed
by a hanging save.

Every write in `src/lib` is wrapped in `withTimeout` so this now surfaces as a
real error after 12 seconds instead of spinning. The timeout does not cancel the
write; Firestore will still deliver it if the connection recovers.

To confirm the cause, ask Google directly:

```bash
curl "https://firestore.googleapis.com/v1/projects/<PROJECT_ID>/databases/(default)/documents/households?key=<API_KEY>"
```

- `SERVICE_DISABLED` / "Cloud Firestore API has not been used in project …" →
  no database. Firebase console → Firestore Database → Create database.
- `PERMISSION_DENIED` with a rules message → the database exists and the rules
  are doing their job; this is the expected response for an unauthenticated
  read.

**Sign-in works but nothing loads.** Auth and Firestore are separate services —
Google sign-in succeeding tells you nothing about whether Firestore exists.

**`auth/unauthorized-domain`.** Add the domain under Authentication → Settings →
Authorised domains.

**`Cross-Origin-Opener-Policy policy would block the window.closed call`** in the
console during sign-in is a benign warning from the Google popup flow and does
not affect authentication.

**Writes are rejected with permission denied.** The rules in `firestore.rules`
are not deployed until you deploy them:
`firebase deploy --only firestore:rules`.

## Known limitations

- **Equal splits only.** Every expense is divided evenly among all current
  members. There is no per-expense participant selection, no weighting by room
  size, and no "this one was only for Chandan and me".
- **Members are a snapshot.** The split uses the household's *current* members,
  so someone joining mid-month shares that whole month's expenses.
- **Settlements are advisory.** The app says who should pay whom; it does not
  record that a payment happened or integrate UPI. A "mark as settled" ledger is
  the obvious next feature.
- **Client clocks.** `createdAt` and `joinedAt` are client timestamps, used only
  for ordering. Rules validate the type but cannot validate honesty.
- **Member names can go stale.** A member's `displayName` is captured when they
  join; changing it in Google does not rewrite old rows. Expenses store
  `payerName` at write time on purpose, so history reads correctly after someone
  leaves.
- **Removed members' expenses are excluded** from the split rather than
  reassigned. The total is reported so nothing disappears silently, but
  reconciling it is a manual decision.
- **No offline persistence.** Firestore's local cache is not enabled, so the app
  needs a connection.
