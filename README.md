# RoomieHisab — Roommate Expense Tracker

Mobile-first shared-expense tracker built with Next.js App Router, TypeScript, Tailwind CSS, and Firebase Authentication + Cloud Firestore.

## Features
- Sign in with Google (Firebase Auth).
- Create a household and invite roommates with a household code.
- Add expenses with amount, description/item, date, payer, and optional notes.
- Live dashboard totals per roommate using Firestore snapshots.
- Fair split across all active household members.
- Settlement suggestions: who should pay whom and how much, supporting 2+ people.
- Expense history with delete option for the expense creator.
- Responsive phone-first layout.

## Setup
1. Install Node.js 20+.
2. Run `npm install`.
3. Create a Firebase project at https://console.firebase.google.com/.
4. Enable **Authentication → Google** and create a **Cloud Firestore** database.
5. Copy `.env.example` to `.env.local` and fill in your Firebase web app config.
6. In Firebase Console → Firestore → Rules, deploy the rules from `firestore.rules`.
7. Run `npm run dev` and open http://localhost:3000.

## Firebase configuration
The app uses the Firebase **client SDK** for Auth and Firestore. Never put Firebase Admin private keys or service-account JSON in client environment variables. The `NEXT_PUBLIC_` config values are public web-app config; security is enforced by Firestore Rules.

## Important notes
- Settlement is computed from total expenses divided equally by active household members.
- If Chandan paid ₹50 and Shyam paid ₹20, total is ₹70, per-person share is ₹35, so Shyam owes Chandan ₹15.
- For 3+ people, the app calculates net balances and produces a set of transfers that settles everyone with minimal straightforward transfers.
- This starter uses household membership records in Firestore. For production, add stronger invitation approval/expiry, audit logs, and automated tests before handling sensitive household data.
