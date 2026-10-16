"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User
} from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp,
  setDoc, where, type Unsubscribe
} from "firebase/firestore";
import { ArrowDownLeft, ArrowUpRight, Check, CircleDollarSign, LogOut, Plus, ReceiptText, Users, Wallet, X } from "lucide-react";
import { auth, db, firebaseConfigured, googleProvider } from "@/lib/firebase";
import { calculateSettlements, type Expense, type Member } from "@/lib/settlements";

type Household = { id: string; name: string; createdBy: string; inviteCode: string };
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);
const today = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [householdName, setHouseholdName] = useState("Our Flat");
  const [joinCode, setJoinCode] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [paidBy, setPaidBy] = useState("");
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState<"overview" | "expenses" | "settle">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!auth) { setAuthReady(true); return; }
    return onAuthStateChanged(auth, (next) => { setUser(next); setAuthReady(true); });
  }, []);

  useEffect(() => {
    if (!user || !db) { setHousehold(null); setMembers([]); setExpenses([]); return; }
    let unsubMembers: Unsubscribe | undefined, unsubExpenses: Unsubscribe | undefined;
    let cancelled = false;
    (async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const householdId = userSnap.exists() ? userSnap.data().householdId as string | undefined : undefined;
        if (!householdId || cancelled) { setHousehold(null); return; }
        const hSnap = await getDoc(doc(db, "households", householdId));
        if (!hSnap.exists() || cancelled) { setHousehold(null); return; }
        setHousehold({ id: hSnap.id, ...hSnap.data() } as Household);
        unsubMembers = onSnapshot(collection(db, "households", householdId, "members"), snap => {
          setMembers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Member)));
        }, e => setError(e.message));
        unsubExpenses = onSnapshot(collection(db, "households", householdId, "expenses"), snap => {
          setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)).sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)));
        }, e => setError(e.message));
      } catch (e) { setError(e instanceof Error ? e.message : "Could not load household."); }
    })();
    return () => { cancelled = true; unsubMembers?.(); unsubExpenses?.(); };
  }, [user]);

  const summary = useMemo(() => calculateSettlements(members, expenses), [members, expenses]);
  const myBalance = summary.balances.find(b => b.uid === user?.uid);
  const myTransfers = summary.transfers.filter(t => t.fromUid === user?.uid || t.toUid === user?.uid);

  async function login() {
    if (!auth) return;
    setError("");
    try { await signInWithPopup(auth, googleProvider); } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed."); }
  }

  async function createHousehold(e: FormEvent) {
    e.preventDefault();
    if (!user || !db) return;
    setBusy(true); setError("");
    try {
      const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const hRef = doc(collection(db, "households"));
      const data = { name: householdName.trim() || "Our Flat", createdBy: user.uid, inviteCode, createdAt: Date.now() };
      await setDoc(hRef, data);
      await setDoc(doc(db, "households", hRef.id, "members", user.uid), {
        uid: user.uid, displayName: user.displayName || "Roommate", email: user.email || "",
        photoURL: user.photoURL || null, joinedAt: Date.now()
      });
      await setDoc(doc(db, "users", user.uid), { displayName: user.displayName || "", email: user.email || "", householdId: hRef.id }, { merge: true });
      setHousehold({ id: hRef.id, ...data });
      setNotice("Household created. Share the invite code with your roommates.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create household."); }
    finally { setBusy(false); }
  }

  async function joinHousehold(e: FormEvent) {
    e.preventDefault();
    if (!user || !db || !joinCode.trim()) return;
    setBusy(true); setError("");
    try {
      const q = query(collection(db, "households"), where("inviteCode", "==", joinCode.trim().toUpperCase()));
      const { getDocs } = await import("firebase/firestore");
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("Invite code not found. Check with the household owner.");
      const h = snap.docs[0];
      await setDoc(doc(db, "households", h.id, "members", user.uid), {
        uid: user.uid, displayName: user.displayName || "Roommate", email: user.email || "",
        photoURL: user.photoURL || null, joinedAt: Date.now()
      });
      await setDoc(doc(db, "users", user.uid), { displayName: user.displayName || "", email: user.email || "", householdId: h.id }, { merge: true });
      setHousehold({ id: h.id, ...h.data() } as Household);
      setNotice(`Joined ${h.data().name}!`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join household."); }
    finally { setBusy(false); }
  }

  async function addExpense(e: FormEvent) {
    e.preventDefault();
    if (!user || !db || !household) return;
    const numericAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) { setError("Enter an item name and a valid amount greater than ₹0."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await addDoc(collection(db, "households", household.id, "expenses"), {
        description: description.trim(), amount: Math.round(numericAmount * 100) / 100,
        date, paidBy: user.uid, payerName: user.displayName || user.email || "Roommate",
        notes: notes.trim(), createdAt: Date.now(), createdAtServer: serverTimestamp()
      });
      setDescription(""); setAmount(""); setNotes(""); setDate(today());
      setNotice("Expense added. Totals and settlements updated live.");
      setTab("overview");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save expense."); }
    finally { setBusy(false); }
  }

  async function removeExpense(expenseId: string) {
    if (!db || !household || !user || !confirm("Delete this expense?")) return;
    try { await deleteDoc(doc(db, "households", household.id, "expenses", expenseId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete expense."); }
  }

  if (!firebaseConfigured) return <main className="min-h-screen p-5 grid place-items-center"><div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-sm"><div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-white"><Wallet /></div><h1 className="text-2xl font-bold">RoomieHisab setup</h1><p className="mt-2 text-slate-600">Add your Firebase web app configuration to <code>.env.local</code> to get started.</p><pre className="mt-4 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-green-300">NEXT_PUBLIC_FIREBASE_API_KEY=...{"\n"}NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...{"\n"}NEXT_PUBLIC_FIREBASE_PROJECT_ID=...{"\n"}NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...{"\n"}NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...{"\n"}NEXT_PUBLIC_FIREBASE_APP_ID=...</pre><p className="mt-4 text-sm text-slate-500">See README.md for the full setup and Firestore rules.</p></div></main>;

  if (!authReady) return <main className="grid min-h-screen place-items-center text-slate-500">Loading RoomieHisab…</main>;

  if (!user) return <main className="min-h-screen p-5 grid place-items-center"><div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm"><div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600 text-white"><Wallet size={28}/></div><p className="text-sm font-semibold text-indigo-600">ROOMIEHISAB</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Flat ka hisaab, simple.</h1><p className="mt-3 leading-6 text-slate-600">Track shared shopping, see live totals, and know exactly who should pay whom at month end.</p><button onClick={login} className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700">Continue with Google</button>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}<p className="mt-5 text-xs text-slate-500">Your household data is shared only with its members, subject to Firestore rules.</p></div></main>;

  if (!household) return <main className="min-h-screen p-5 grid place-items-center"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-indigo-600">ROOMIEHISAB</p><h1 className="mt-1 text-2xl font-bold">Set up your flat</h1></div><button onClick={() => auth && signOut(auth)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out"><LogOut size={19}/></button></div><p className="mt-2 text-slate-600">Create a shared space or join one using your roommate’s code.</p><form onSubmit={createHousehold} className="mt-6 space-y-3 rounded-2xl border border-slate-200 p-4"><h2 className="font-semibold">Create a new household</h2><input value={householdName} onChange={e=>setHouseholdName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500" placeholder="e.g. Gomti Nagar Flat"/><button disabled={busy} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : "Create household"}</button></form><form onSubmit={joinHousehold} className="mt-4 space-y-3 rounded-2xl border border-slate-200 p-4"><h2 className="font-semibold">Join an existing household</h2><input value={joinCode} onChange={e=>setJoinCode(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 uppercase outline-none focus:border-indigo-500" placeholder="Enter invite code" maxLength={6}/><button disabled={busy} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50 disabled:opacity-60">Join household</button></form>{error && <p className="mt-4 text-sm text-red-600">{error}</p>}{notice && <p className="mt-4 text-sm text-emerald-700">{notice}</p>}</div></main>;

  const paidMe = expenses.filter(e => e.paidBy === user.uid).reduce((s,e)=>s+e.amount,0);
  return <main className="min-h-screen pb-24 md:pb-8">
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white"><Wallet size={21}/></div><div><p className="font-bold tracking-tight">RoomieHisab</p><p className="max-w-[190px] truncate text-xs text-slate-500">{household.name}</p></div></div><div className="flex items-center gap-2"><span className="hidden text-sm text-slate-600 sm:block">{user.displayName || user.email}</span><button onClick={() => {navigator.clipboard?.writeText(household.inviteCode); setNotice("Invite code copied.");}} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50">Code: {household.inviteCode}</button><button onClick={()=>auth && signOut(auth)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out"><LogOut size={18}/></button></div></div></header>
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-indigo-600">Shared flat expenses</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Hey, {(user.displayName || "roomie").split(" ")[0]} 👋</h1><p className="mt-1 text-sm text-slate-500">Every expense updates live for everyone.</p></div><button onClick={()=>setTab("expenses")} className="hidden items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 sm:flex"><Plus size={18}/> Add expense</button></div>
      {error && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><button onClick={()=>setError("")} aria-label="Dismiss"><X size={16}/></button></div>}
      {notice && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss"><X size={16}/></button></div>}
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1"><button onClick={()=>setTab("overview")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab==="overview"?"bg-white shadow-sm":"text-slate-600"}`}>Overview</button><button onClick={()=>setTab("expenses")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab==="expenses"?"bg-white shadow-sm":"text-slate-600"}`}>Expenses</button><button onClick={()=>setTab("settle")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab==="settle"?"bg-white shadow-sm":"text-slate-600"}`}>Who pays whom</button></nav>
      {tab === "expenses" && <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><h2 className="flex items-center gap-2 text-lg font-bold"><Plus size={20} className="text-indigo-600"/> Add an expense</h2><p className="mt-1 text-sm text-slate-500">Example: detergent ₹10, paid by you.</p><form onSubmit={addExpense} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Item / description<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Detergent" required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500"/></label><label className="text-sm font-medium">Amount (₹)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="10" required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500"/></label><label className="text-sm font-medium">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500"/></label><label className="text-sm font-medium">Paid by<input value={user.displayName || user.email || ""} readOnly className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-500"/></label><label className="text-sm font-medium sm:col-span-2">Notes (optional)<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Brand / shop / extra details" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500"/></label><button disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 sm:col-span-2">{busy?"Saving…":<><Plus size={18}/> Save expense</>}</button></form></section>}
      {tab === "overview" && <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<CircleDollarSign size={20}/>} label="Total flat expenses" value={money(summary.total)} tone="indigo"/><Metric icon={<Wallet size={20}/>} label="You have paid" value={money(paidMe)} tone="blue"/><Metric icon={<Users size={20}/>} label="Your fair share" value={money(myBalance?.share || 0)} tone="violet"/><Metric icon={myBalance && myBalance.net >= 0 ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>} label={myBalance && myBalance.net >= 0 ? "You should receive" : "You should pay"} value={money(Math.abs(myBalance?.net || 0))} tone={myBalance && myBalance.net >= 0 ? "green" : "orange"}/></section>
        <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Roommate summary</h2><p className="text-sm text-slate-500">Live totals and fair share</p></div><Users className="text-slate-400"/></div><div className="mt-4 space-y-4">{summary.balances.map(b=><div key={b.uid}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{b.name}{b.uid===user.uid?" (You)":""}</p><p className="text-xs text-slate-500">Paid {money(b.paid)} · Share {money(b.share)}</p></div><div className="text-right"><p className={`font-bold ${b.net>=0?"text-emerald-700":"text-orange-700"}`}>{b.net>=0?"+":"−"}{money(Math.abs(b.net))}</p><p className="text-xs text-slate-500">{Math.abs(b.net)<0.01?"Settled":b.net>0?"gets back":"owes"}</p></div></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{width:`${summary.total ? Math.min(100,(b.paid/summary.total)*100):0}%`}}/></div></div>)}{members.length===0&&<p className="py-6 text-center text-sm text-slate-500">Waiting for household members…</p>}</div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Your settlements</h2><p className="text-sm text-slate-500">Who should pay whom</p></div><ReceiptText className="text-slate-400"/></div><div className="mt-4 space-y-3">{myTransfers.length ? myTransfers.map((t,i)=><div key={i} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 truncate font-semibold">{t.fromUid===user.uid?"You":t.fromName}</span><ArrowUpRight size={16} className="shrink-0 text-slate-400"/><span className="min-w-0 flex-1 truncate font-semibold">{t.toUid===user.uid?"You":t.toName}</span></div><p className="mt-2 text-lg font-bold">{money(t.amount)}</p><p className="text-xs text-slate-500">{t.fromUid===user.uid?"You need to send":t.toUid===user.uid?`${t.fromName} needs to send you`:`${t.fromName} pays ${t.toName}`}</p></div>) : <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><Check size={18} className="mb-2"/><p className="font-semibold">All settled up!</p><p className="mt-1">No transfers needed right now.</p></div>}<button onClick={()=>setTab("settle")} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold hover:bg-slate-50">View all settlements</button></div></div></section>
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">Recent expenses</h2><p className="text-sm text-slate-500">Latest shared purchases</p></div><button onClick={()=>setTab("expenses")} className="text-sm font-semibold text-indigo-600">View all</button></div><ExpenseList expenses={expenses.slice(0,5)} members={members} userUid={user.uid} onDelete={removeExpense}/></section>
      </>}
      {tab === "settle" && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><h2 className="text-xl font-bold">Settlement plan</h2><p className="mt-1 text-sm text-slate-500">Total {money(summary.total)} ÷ {members.length} members = {money(summary.share)} per person.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{summary.balances.map(b=><div key={b.uid} className="rounded-xl border border-slate-200 p-4"><p className="font-semibold">{b.name}{b.uid===user.uid?" (You)":""}</p><p className="mt-1 text-sm text-slate-500">Paid {money(b.paid)} · Fair share {money(b.share)}</p><p className={`mt-3 text-xl font-bold ${b.net>=0?"text-emerald-700":"text-orange-700"}`}>{b.net>=0?"+":"−"}{money(Math.abs(b.net))}</p><p className="text-xs text-slate-500">{Math.abs(b.net)<0.01?"No payment needed":b.net>0?"should receive":"should pay"}</p></div>)}</div><h3 className="mt-7 font-bold">Transfers to settle</h3><div className="mt-3 space-y-3">{summary.transfers.length?summary.transfers.map((t,i)=><div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="font-semibold">{t.fromUid===user.uid?"You":t.fromName} <span className="font-normal text-slate-500">sends to</span> {t.toUid===user.uid?"You":t.toName}</p><p className="mt-1 text-xs text-slate-500">{t.fromUid===user.uid?"You need to send this amount":t.toUid===user.uid?"You will receive this amount":"Transfer between roommates"}</p></div><p className="text-lg font-bold">{money(t.amount)}</p></div>):<p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No transfers needed. Everyone is balanced.</p>}</div></section>}
      <footer className="mt-8 text-center text-xs text-slate-400">Live sync powered by Firebase · Invite code: {household.inviteCode}</footer>
    </div>
    <button onClick={()=>setTab("expenses")} className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 sm:hidden" aria-label="Add expense"><Plus size={25}/></button>
    <div className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-3 border-t border-slate-200 bg-white/95 p-2 backdrop-blur sm:hidden"><MobileNav active={tab==="overview"} icon={<Wallet size={18}/>} label="Home" onClick={()=>setTab("overview")}/><MobileNav active={tab==="expenses"} icon={<ReceiptText size={18}/>} label="Expenses" onClick={()=>setTab("expenses")}/><MobileNav active={tab==="settle"} icon={<Users size={18}/>} label="Settle" onClick={()=>setTab("settle")}/></div>
  </main>;
}

function Metric({icon,label,value,tone}:{icon:React.ReactNode;label:string;value:string;tone:string}) {
 const tones:Record<string,string>={indigo:"bg-indigo-50 text-indigo-700",blue:"bg-blue-50 text-blue-700",violet:"bg-violet-50 text-violet-700",green:"bg-emerald-50 text-emerald-700",orange:"bg-orange-50 text-orange-700"};
 return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${tones[tone]||tones.indigo}`}>{icon}</div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}</p></div>;
}
function ExpenseList({expenses,members,userUid,onDelete}:{expenses:Expense[];members:Member[];userUid:string;onDelete:(id:string)=>void}) {
 if (!expenses.length) return <div className="rounded-xl bg-slate-50 p-7 text-center"><ReceiptText className="mx-auto mb-2 text-slate-400"/><p className="font-semibold">No expenses yet</p><p className="mt-1 text-sm text-slate-500">Add your first purchase to start the shared hisaab.</p></div>;
 return <div className="divide-y divide-slate-100">{expenses.map(e=>{const payer=members.find(m=>m.uid===e.paidBy);return <div key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><ReceiptText size={18}/></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{e.description}</p><p className="truncate text-xs text-slate-500">{e.date} · {payer?.displayName || (e.paidBy===userUid?"You": "Roommate")}{e.notes?` · ${e.notes}`:""}</p></div><div className="text-right"><p className="font-bold">{money(e.amount)}</p>{e.paidBy===userUid&&<button onClick={()=>onDelete(e.id)} className="mt-1 text-xs font-medium text-red-600">Delete</button>}</div></div>})}</div>;
}
function MobileNav({active,icon,label,onClick}:{active:boolean;icon:React.ReactNode;label:string;onClick:()=>void}) {
 return <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-semibold ${active?"text-indigo-600":"text-slate-500"}`}>{icon}{label}</button>;
}
