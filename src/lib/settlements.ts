/**
 * Settlement engine. Pure, dependency-free and integer-only so it can be unit
 * tested in isolation — see `src/lib/__tests__/settlements.test.ts`.
 *
 * ## The rules
 * 1. `total` = sum of every *eligible* expense (paid by an active member, inside
 *    the selected month).
 * 2. Everyone splits that total equally: `share = total / memberCount`.
 * 3. `net = paid - share`. Positive net means the member is owed money,
 *    negative net means the member owes money.
 * 4. Debtors are matched against creditors until every net is zero.
 *
 * ## Rounding residuals
 * A total of ₹70.00 across 3 members is 7000 paise / 3 = 2333.33… paise, which
 * no set of real payments can match. Rather than let that third of a paise drift
 * into the transfers, we make the *shares* absorb it:
 *
 *   base      = floor(total / memberCount)            // 2333 paise each
 *   remainder = total - base * memberCount            // 1 paise left over
 *
 * The remainder is handed out as one extra paise each to the first `remainder`
 * members in a stable order (ascending uid), so a member may be charged exactly
 * one paise more than another. Because `sum(shares) === total` exactly,
 * `sum(nets) === 0` exactly, and total outgoing transfers therefore always equal
 * total incoming transfers with nothing left over. No transfer is ever generated
 * for less than one paise, and nobody is ever told to pay themselves.
 */

export type SettlementMember = {
  uid: string;
  name: string;
};

export type SettlementExpense = {
  paidBy: string;
  amountPaise: number;
};

export type Balance = {
  uid: string;
  name: string;
  /** What this member actually spent, in paise. */
  paidPaise: number;
  /** This member's slice of the total, in paise, residual included. */
  sharePaise: number;
  /** paidPaise - sharePaise. Positive: owed money. Negative: owes money. */
  netPaise: number;
  status: "owed" | "owes" | "settled";
};

export type Transfer = {
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  amountPaise: number;
};

export type Settlement = {
  /** Sum of eligible expenses, in paise. */
  totalPaise: number;
  /** The even split before residual distribution — the number to show as "fair share". */
  evenSharePaise: number;
  /** Paise that could not be divided evenly and were spread across members. */
  residualPaise: number;
  memberCount: number;
  balances: Balance[];
  transfers: Transfer[];
  /** Expenses skipped because their payer is no longer an active member. */
  ignored: { count: number; totalPaise: number };
};

/** One paise: anything smaller is noise and never becomes a transfer. */
const EPSILON_PAISE = 1;

function sanitise(amountPaise: number): number {
  if (!Number.isFinite(amountPaise)) return 0;
  const rounded = Math.round(amountPaise);
  return rounded > 0 ? rounded : 0;
}

export function calculateSettlement(
  members: SettlementMember[],
  expenses: SettlementExpense[],
): Settlement {
  // A stable order keeps both the residual distribution and the transfer list
  // deterministic, which is what makes the output testable.
  const ordered = [...members].sort((a, b) => a.uid.localeCompare(b.uid));
  const memberUids = new Set(ordered.map((m) => m.uid));

  const paidByUid = new Map<string, number>();
  let totalPaise = 0;
  const ignored = { count: 0, totalPaise: 0 };

  for (const expense of expenses) {
    const amount = sanitise(expense.amountPaise);
    if (amount === 0) continue;
    if (!memberUids.has(expense.paidBy)) {
      // Paid by someone who has since left the household: counting it would
      // make the nets stop summing to zero, so it is reported instead.
      ignored.count += 1;
      ignored.totalPaise += amount;
      continue;
    }
    totalPaise += amount;
    paidByUid.set(expense.paidBy, (paidByUid.get(expense.paidBy) ?? 0) + amount);
  }

  const memberCount = ordered.length;
  if (memberCount === 0) {
    return {
      totalPaise: 0,
      evenSharePaise: 0,
      residualPaise: 0,
      memberCount: 0,
      balances: [],
      transfers: [],
      ignored,
    };
  }

  const basePaise = Math.floor(totalPaise / memberCount);
  const residualPaise = totalPaise - basePaise * memberCount;

  const balances: Balance[] = ordered.map((member, index) => {
    const paidPaise = paidByUid.get(member.uid) ?? 0;
    const sharePaise = basePaise + (index < residualPaise ? 1 : 0);
    const netPaise = paidPaise - sharePaise;
    return {
      uid: member.uid,
      name: member.name,
      paidPaise,
      sharePaise,
      netPaise,
      status: netPaise >= EPSILON_PAISE ? "owed" : netPaise <= -EPSILON_PAISE ? "owes" : "settled",
    };
  });

  return {
    totalPaise,
    evenSharePaise: basePaise,
    residualPaise,
    memberCount,
    balances,
    transfers: buildTransfers(balances),
    ignored,
  };
}

/**
 * Greedy largest-debt-to-largest-credit matching. Each pass fully clears at
 * least one person, so at most `memberCount - 1` transfers are produced.
 */
function buildTransfers(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.netPaise >= EPSILON_PAISE)
    .map((b) => ({ uid: b.uid, name: b.name, remaining: b.netPaise }))
    .sort((a, b) => b.remaining - a.remaining || a.uid.localeCompare(b.uid));

  const debtors = balances
    .filter((b) => b.netPaise <= -EPSILON_PAISE)
    .map((b) => ({ uid: b.uid, name: b.name, remaining: -b.netPaise }))
    .sort((a, b) => b.remaining - a.remaining || a.uid.localeCompare(b.uid));

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const amountPaise = Math.min(debtor.remaining, creditor.remaining);

    // Self-payment is structurally impossible (a uid cannot be both a debtor and
    // a creditor), but the guard documents the invariant.
    if (amountPaise >= EPSILON_PAISE && debtor.uid !== creditor.uid) {
      transfers.push({
        fromUid: debtor.uid,
        fromName: debtor.name,
        toUid: creditor.uid,
        toName: creditor.name,
        amountPaise,
      });
    }

    debtor.remaining -= amountPaise;
    creditor.remaining -= amountPaise;
    if (debtor.remaining < EPSILON_PAISE) d += 1;
    if (creditor.remaining < EPSILON_PAISE) c += 1;
  }

  return transfers;
}

/** Only the transfers the given user has to act on. */
export function transfersForUser(transfers: Transfer[], uid: string) {
  return {
    toSend: transfers.filter((t) => t.fromUid === uid),
    toReceive: transfers.filter((t) => t.toUid === uid),
  };
}
