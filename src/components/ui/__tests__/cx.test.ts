/**
 * `cx` is the only place that knows Tailwind's stylesheet order, so the rule it
 * enforces is worth pinning down: a `hidden` written by a caller has to beat the
 * `inline-flex` or `grid` baked into a component, whatever order the stylesheet
 * happens to emit them in.
 */

import { describe, expect, it } from "vitest";

import { cx } from "../primitives";

describe("cx", () => {
  it("joins the parts it is given and drops the falsy ones", () => {
    expect(cx("a", false, "b", null, undefined, "c")).toBe("a b c");
  });

  it("lets a caller's `hidden` win over a component's base display class", () => {
    // The real case: `Button` is `inline-flex`, the header asks for it to be
    // hidden below `sm`. Tailwind emits `.inline-flex` after `.hidden`, so
    // without this both would land on the element and the button would show.
    expect(cx("inline-flex items-center", "hidden sm:inline-flex")).toBe(
      "items-center hidden sm:inline-flex",
    );
  });

  it("lets a caller's `grid` win over a base `hidden`, in the other direction", () => {
    expect(cx("hidden", "grid")).toBe("grid");
  });

  it("resolves each responsive variant on its own", () => {
    // `hidden` applies below `sm`, `sm:flex` from `sm` up: both must survive.
    expect(cx("flex", "hidden sm:flex")).toBe("hidden sm:flex");
    expect(cx("sm:hidden", "sm:grid")).toBe("sm:grid");
    expect(cx("grid sm:hidden", "lg:flex")).toBe("grid sm:hidden lg:flex");
  });

  it("leaves every other utility alone, including look-alikes", () => {
    // `overflow-hidden` and `flex-col` only contain a display word, they are not
    // display utilities, and nothing may be dropped on their account.
    expect(cx("overflow-hidden flex-col grid-cols-2", "shrink-0")).toBe(
      "overflow-hidden flex-col grid-cols-2 shrink-0",
    );
  });

  it("keeps the last of several display classes in one string", () => {
    expect(cx("block flex hidden")).toBe("hidden");
  });
});
