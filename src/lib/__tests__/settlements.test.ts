import { describe, expect, it } from "vitest";
import {
  calculateSettlement,
  transfersForUser,
  type Settlement,
  type SettlementExpense,
  type SettlementMember,
} from "../settlements";

const member = (uid: string, name = uid): SettlementMember => ({ uid, name });
const paid = (uid: string, rupees: number): SettlementExpense => ({
  paidBy: uid,
  amountPaise: Math.round(rupees * 100),
});

/** Every settlement must conserve money, whatever the inputs. */
function expectInvariants(result: Settlement) {
  const sumShares = result.balances.reduce((s, b) => s + b.sharePaise, 0);
  const sumNets = result.balances.reduce((s, b) => s + b.netPaise, 0);
  const sumPaid = result.balances.reduce((s, b) => s + b.paidPaise, 0);

  expect(sumShares).toBe(result.totalPaise);
  expect(sumPaid).toBe(result.totalPaise);
  expect(sumNets).toBe(0);

  // Outgoing must exactly equal incoming — no residual may leak into transfers.
  const out = new Map<string, number>();
  const inc = new Map<string, number>();
  for (const t of result.transfers) {
    expect(t.amountPaise).toBeGreaterThan(0);
    expect(t.fromUid).not.toBe(t.toUid);
    out.set(t.fromUid, (out.get(t.fromUid) ?? 0) + t.amountPaise);
    inc.set(t.toUid, (inc.get(t.toUid) ?? 0) + t.amountPaise);
  }
  const totalOut = [...out.values()].reduce((s, n) => s + n, 0);
  const totalIn = [...inc.values()].reduce((s, n) => s + n, 0);
  expect(totalOut).toBe(totalIn);

  // And each person's transfers must clear exactly their own net.
  for (const b of result.balances) {
    const settled = (inc.get(b.uid) ?? 0) - (out.get(b.uid) ?? 0);
    expect(settled).toBe(b.netPaise);
  }

  // Greedy matching never needs more than memberCount - 1 transfers.
  if (result.memberCount > 0) {
    expect(result.transfers.length).toBeLessThanOrEqual(result.memberCount - 1);
  }
}

describe("calculateSettlement - two members", () => {
  it("settles the README example: Chandan 50, Shyam 20", () => {
    const result = calculateSettlement(
      [member("chandan", "Chandan"), member("shyam", "Shyam")],
      [paid("chandan", 50), paid("shyam", 20)],
    );

    expect(result.totalPaise).toBe(7000);
    expect(result.evenSharePaise).toBe(3500);
    expect(result.residualPaise).toBe(0);
    expect(result.transfers).toEqual([
      { fromUid: "shyam", fromName: "Shyam", toUid: "chandan", toName: "Chandan", amountPaise: 1500 },
    ]);
    expectInvariants(result);
  });

  it("handles the detergent case where only one person has spent", () => {
    const result = calculateSettlement(
      [member("chandan", "Chandan"), member("shyam", "Shyam")],
      [paid("chandan", 10)],
    );

    expect(result.totalPaise).toBe(1000);
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]).toMatchObject({ fromUid: "shyam", toUid: "chandan", amountPaise: 500 });
    expectInvariants(result);
  });

  it("reports everyone settled when spending is already equal", () => {
    const result = calculateSettlement(
      [member("a"), member("b")],
      [paid("a", 25), paid("b", 25)],
    );

    expect(result.transfers).toEqual([]);
    expect(result.balances.every((b) => b.status === "settled")).toBe(true);
    expectInvariants(result);
  });
});

describe("calculateSettlement - three or more members", () => {
  it("splits one member's 90 across three members", () => {
    const result = calculateSettlement(
      [member("a", "A"), member("b", "B"), member("c", "C")],
      [paid("a", 90)],
    );

    expect(result.evenSharePaise).toBe(3000);
    expect(result.transfers).toHaveLength(2);
    expect(result.transfers.map((t) => [t.fromUid, t.toUid, t.amountPaise])).toEqual([
      ["b", "a", 3000],
      ["c", "a", 3000],
    ]);
    expectInvariants(result);
  });

  it("gives a zero-spend member a full debt and no credit", () => {
    const result = calculateSettlement(
      [member("a"), member("b"), member("c"), member("d")],
      [paid("a", 100), paid("b", 100), paid("c", 100)],
    );

    const d = result.balances.find((b) => b.uid === "d");
    expect(d).toBeDefined();
    expect(d?.paidPaise).toBe(0);
    expect(d?.sharePaise).toBe(7500);
    expect(d?.netPaise).toBe(-7500);
    expect(d?.status).toBe("owes");
    expect(result.transfers.every((t) => t.fromUid === "d")).toBe(true);
    expectInvariants(result);
  });

  it("settles a five-member household with mixed spending", () => {
    const result = calculateSettlement(
      [member("a"), member("b"), member("c"), member("d"), member("e")],
      [paid("a", 1200.5), paid("b", 310.25), paid("c", 0.75), paid("e", 980)],
    );

    expect(result.totalPaise).toBe(249150);
    expectInvariants(result);
  });

  it("produces no transfers for a household that has spent nothing", () => {
    const result = calculateSettlement([member("a"), member("b"), member("c")], []);

    expect(result.totalPaise).toBe(0);
    expect(result.transfers).toEqual([]);
    expect(result.balances.map((b) => b.netPaise)).toEqual([0, 0, 0]);
    expectInvariants(result);
  });
});

describe("calculateSettlement - rounding residuals", () => {
  it("absorbs an indivisible total into the shares, one paise at a time", () => {
    // 7000 paise / 3 = 2333.33... - a third of a paise cannot be paid.
    const result = calculateSettlement(
      [member("a"), member("b"), member("c")],
      [paid("a", 70)],
    );

    expect(result.evenSharePaise).toBe(2333);
    expect(result.residualPaise).toBe(1);
    expect(result.balances.map((b) => b.sharePaise)).toEqual([2334, 2333, 2333]);
    expect(result.balances.reduce((s, b) => s + b.sharePaise, 0)).toBe(7000);
    expectInvariants(result);
  });

  it("keeps shares exact for every member count from 2 to 11", () => {
    for (let n = 2; n <= 11; n += 1) {
      const members = Array.from({ length: n }, (_, i) => member(`m${i}`));
      const result = calculateSettlement(members, [paid("m0", 100), paid("m1", 0.01)]);

      expect(result.balances.reduce((s, b) => s + b.sharePaise, 0)).toBe(result.totalPaise);
      const shares = result.balances.map((b) => b.sharePaise);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
      expectInvariants(result);
    }
  });

  it("never emits a sub-paise transfer", () => {
    const result = calculateSettlement(
      [member("a"), member("b"), member("c")],
      [paid("a", 0.02), paid("b", 0.01)],
    );

    expect(result.transfers.every((t) => t.amountPaise >= 1)).toBe(true);
    expectInvariants(result);
  });

  it("stays exact on amounts that lose precision as floats", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; in paise it is simply 30.
    const result = calculateSettlement(
      [member("a"), member("b")],
      [
        { paidBy: "a", amountPaise: 10 },
        { paidBy: "a", amountPaise: 20 },
      ],
    );

    expect(result.totalPaise).toBe(30);
    expect(result.balances.map((b) => b.sharePaise)).toEqual([15, 15]);
    expectInvariants(result);
  });
});

describe("calculateSettlement - defensive behaviour", () => {
  it("returns an empty settlement when the household has no members", () => {
    const result = calculateSettlement([], [paid("ghost", 50)]);

    expect(result).toMatchObject({ totalPaise: 0, memberCount: 0, balances: [], transfers: [] });
  });

  it("ignores expenses paid by someone who has left, and reports them", () => {
    const result = calculateSettlement(
      [member("a"), member("b")],
      [paid("a", 40), paid("ex-roommate", 60)],
    );

    expect(result.totalPaise).toBe(4000);
    expect(result.ignored).toEqual({ count: 1, totalPaise: 6000 });
    expectInvariants(result);
  });

  it("discards negative, zero and non-finite amounts", () => {
    const result = calculateSettlement(
      [member("a"), member("b")],
      [
        paid("a", 20),
        { paidBy: "a", amountPaise: -500 },
        { paidBy: "b", amountPaise: 0 },
        { paidBy: "b", amountPaise: Number.NaN },
      ],
    );

    expect(result.totalPaise).toBe(2000);
    expectInvariants(result);
  });

  it("is independent of the order members and expenses arrive in", () => {
    const members = [member("c"), member("a"), member("b")];
    const expenses = [paid("b", 15), paid("a", 60), paid("c", 3.33)];
    const forward = calculateSettlement(members, expenses);
    const reversed = calculateSettlement([...members].reverse(), [...expenses].reverse());

    expect(reversed.balances).toEqual(forward.balances);
    expect(reversed.transfers).toEqual(forward.transfers);
  });

  it("handles a single-member household by charging them their own total", () => {
    const result = calculateSettlement([member("solo")], [paid("solo", 99.99)]);

    expect(result.balances[0]).toMatchObject({ paidPaise: 9999, sharePaise: 9999, netPaise: 0 });
    expect(result.transfers).toEqual([]);
    expectInvariants(result);
  });
});

describe("transfersForUser", () => {
  it("separates what the user must send from what they will receive", () => {
    const result = calculateSettlement(
      [member("a"), member("b"), member("c")],
      [paid("a", 60), paid("b", 30)],
    );

    const forC = transfersForUser(result.transfers, "c");
    expect(forC.toReceive).toEqual([]);
    expect(forC.toSend.reduce((s, t) => s + t.amountPaise, 0)).toBe(3000);

    const forA = transfersForUser(result.transfers, "a");
    expect(forA.toSend).toEqual([]);
    expect(forA.toReceive.length).toBeGreaterThan(0);
  });
});
