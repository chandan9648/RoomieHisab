# Prompt for Claude Code — RoomieHisab

You are a senior full-stack engineer. Build and polish a production-minded, mobile-first shared household expense tracking website named **RoomieHisab**.

## Mandatory stack
- Next.js App Router
- TypeScript (strict mode)
- Tailwind CSS
- Firebase Authentication (Google sign-in) and Cloud Firestore
- Lucide React icons
- Deployable on Vercel
- Do NOT replace Firebase with Supabase or another backend.

## Main goal
Roommates currently write purchases manually and divide expenses at month end. Replace that notebook with a real-time, phone-first dashboard. Several roommates can join the same household, add expenses, and instantly see totals and fair settlement suggestions.

## Core user stories
1. A user signs in with Google.
2. A user can create a household or join one using an invite code.
3. Each expense stores item/description, amount in INR, date, payer UID, payer name, optional note, and created timestamp.
4. Example: Chandan buys detergent for ₹10 and adds it under their account. The purchase appears in the shared expense list and all dashboards update in real time.
5. The dashboard shows total household expenses, each roommate's total paid, equal fair share, net balance, and the current user's own paid/share/balance.
6. The dashboard must explain who should pay whom and the exact amount to send/receive.
7. Support any number of roommates, not just two.
8. Mobile layout is the priority: comfortable tap targets, bottom navigation, responsive cards, readable currency amounts, no horizontal overflow, accessible forms and loading/error/empty states.

## Settlement algorithm (critical)
- Sum all eligible expenses: `total`.
- Split equally among all active household members: `share = total / memberCount`.
- For each member: `net = amountPaidByMember - share`.
- Positive net means that member should receive money; negative net means that member owes money.
- Produce transfer suggestions from debtors to creditors until all net balances are settled, handling 2, 3, 4, or more members.
- Use integer paise internally where practical to avoid floating-point errors; display INR to 2 decimals at most.
- Do not tell a person to pay themselves. Ignore tiny rounding residuals and ensure total suggested outgoing transfers equals total incoming transfers.
- Example: Chandan paid ₹50, Shyam paid ₹20. Total ₹70, share ₹35. Shyam pays Chandan ₹15.
- Example with 3 roommates: A pays ₹90, B pays ₹0, C pays ₹0. Share ₹30 each. B pays A ₹30 and C pays A ₹30.
- Show each person's paid total, fair share, net amount, and a clear "gets back / owes" status.
- Label all transfers: "X sends ₹Y to Z". For the logged-in user, clearly separate "You need to send" and "You will receive".
- Define and document how rounding residuals are handled.

## Data model
Use a household document with fields such as `name`, `createdBy`, `inviteCode`, `createdAt`.
Use a `members` subcollection keyed by Firebase Auth UID, storing `displayName`, `email`, `photoURL`, `joinedAt`, and role.
Use an `expenses` subcollection with `description`, `amountPaise`, `date`, `paidBy`, `payerName`, `notes`, `createdAt`.
Use a user profile document mapping each UID to its current `householdId`.
Prevent a user from accidentally joining multiple households unless the UI explicitly supports switching. Explain household switching behavior.

## Realtime and security
- Use Firestore `onSnapshot` listeners and clean them up on unmount.
- Add robust loading, permission-denied, network, and empty states.
- Include secure `firestore.rules`; never use `allow read, write: if true`.
- Check household membership for every read/write.
- Only the expense payer or an authorized household admin can edit/delete an expense.
- Validate positive finite amounts, dates, text lengths, and household membership.
- Never expose Firebase Admin credentials in client code. Use `.env.local` for public Firebase web configuration.
- Treat invite codes as join credentials: use adequate entropy, avoid exposing household records to non-members, and consider a callable Cloud Function/transaction to validate and consume invitations securely.
- Include clear setup docs for Firebase Auth, Firestore, env variables, local development, build, and Vercel deployment.

## Dashboard UI
Create a polished interface with a restrained modern palette, rounded cards, subtle borders/shadows, excellent typography, and clear hierarchy. Avoid a generic unstyled admin template.
Include:
- Header with household name, profile, sign-out, and invite-code copy action.
- Summary cards: total flat spend, current user's paid total, fair share, net receive/pay.
- Roommate list: name, total paid, equal share, net balance, progress indicator.
- Recent expenses and full history.
- Add expense form with item, amount, date, payer, notes.
- Settlement panel showing all suggested transfers.
- Mobile bottom navigation and floating add button.
- Good responsive behavior from 320px width through desktop.
- INR formatting using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
- Accessible labels, focus states, keyboard navigation, and confirmation before deletion.

## Month-end accounting
- Add a month selector/filter, defaulting to current month.
- Settlements should calculate from the selected month only, and clearly show which month is selected.
- Preserve historical expenses. Do not delete old expenses when a new month starts.
- Consider an "All time" filter and month-specific summary.
- Keep settlement calculation pure and cover it with tests.

## Quality checklist
- Implement reusable components and clean folder structure.
- Add unit tests for settlement calculations including 2-member, 3-member, zero-spend member, and rounding edge cases.
- Run `npm run build`, lint, and tests. Fix issues rather than hiding them.
- Do not remove existing functionality while improving the project.
- Provide a concise README and `.env.example`.
- Before finishing, report what was implemented, exact setup steps, environment variables needed, tests/build status, and any remaining limitations.
- Start by inspecting the existing repo. If it is not empty, preserve unrelated code and adapt it rather than overwriting files blindly.

## Existing starter
This ZIP includes an initial implementation. Inspect it, fix any build/lint/type/security issues, and finish the requirements above. Specifically verify Firestore security rules, month filtering, invitation security, and automated settlement tests before calling it production-ready.
