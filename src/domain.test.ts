import { describe, expect, it } from "vitest";
import {
  addEverydayExpense,
  categoriesFor,
  defaultCategoryTypes,
  emptyData,
  formatAmount,
  freeMoney,
  normalizeData,
  spent,
  stillPlanned,
  suggestedPreviousBalance,
  periodState,
  recalculateAutomaticEverydayLimits,
  settleScheduledOneOffExpenses,
  syncAutomaticEverydaySettings,
  validBackup,
  type Period,
} from "./domain";
const period = (overrides: Partial<Period> = {}): Period => ({
  id: "1",
  startDate: "2026-07-01",
  nextSalaryDate: "2026-08-01",
  income: 100000,
  previousBalance: -5000,
  current: true,
  createdAt: "",
  mandatory: [],
  everyday: [],
  oneOff: [],
  impulse: [],
  ...overrides,
});
describe("financial calculations", () => {
  it("reserves each planned amount once", () => {
    const p = period({
      mandatory: [
        { id: "m", category: "rent", amount: 30000, status: "предстоит" },
      ],
      everyday: [
        {
          id: "e",
          category: "food",
          limit: 20000,
          expenses: [{ id: "x", amount: 5000 }],
        },
      ],
      oneOff: [
        { id: "o", category: "health", amount: 10000, status: "предстоит" },
      ],
      impulse: [{ id: "i", category: "shopping", amount: 2000 }],
    });
    expect(freeMoney(p)).toBe(33000);
  });
  it("does not subtract again when paid", () => {
    const a = period({
      mandatory: [
        { id: "m", category: "rent", amount: 30000, status: "предстоит" },
      ],
    });
    const b = {
      ...a,
      mandatory: [{ ...a.mandatory[0], status: "оплачено" as const }],
    };
    expect(freeMoney(a)).toBe(freeMoney(b));
  });
  it("does not subtract a one-off expense again when paid", () => {
    const a = period({
      oneOff: [
        { id: "o", category: "health", amount: 8000, status: "предстоит" },
      ],
    });
    const b = {
      ...a,
      oneOff: [{ ...a.oneOff[0], status: "оплачено" as const }],
    };
    expect(freeMoney(a)).toBe(freeMoney(b));
  });
  it("settles a dated one-off expense without changing free money", () => {
    const current = period({
      oneOff: [
        {
          id: "o",
          category: "здоровье",
          amount: 8000,
          status: "предстоит",
          date: "2026-07-23",
        },
        {
          id: "later",
          category: "покупки",
          amount: 3000,
          status: "предстоит",
          date: "2026-07-24",
        },
        {
          id: "undated",
          category: "услуги",
          amount: 2000,
          status: "предстоит",
        },
      ],
    });
    const data = { ...emptyData(), periods: [current] };
    const settled = settleScheduledOneOffExpenses(data, "2026-07-23");
    expect(settled.periods[0].oneOff).toEqual([
      expect.objectContaining({ id: "o", status: "оплачено", date: undefined }),
      expect.objectContaining({ id: "later", status: "предстоит" }),
      expect.objectContaining({ id: "undated", status: "предстоит" }),
    ]);
    expect(freeMoney(settled.periods[0])).toBe(freeMoney(current));
  });
  it("allows negative still planned after overspending", () => {
    const l = {
      id: "1",
      category: "food",
      limit: 1000,
      expenses: [{ id: "e", amount: 1400 }],
    };
    expect(spent(l)).toBe(1400);
    expect(stillPlanned(l)).toBe(-400);
  });
  it("creates a limit from the first expense when the category has no limit", () => {
    const items = addEverydayExpense(
      [],
      "еда",
      { id: "expense", amount: 1200 },
      "limit",
    );
    expect(items[0].limit).toBe(1200);
    expect(stillPlanned(items[0])).toBe(0);
  });
  it("keeps an existing limit and exposes overspending", () => {
    const items = addEverydayExpense(
      [
        {
          id: "limit",
          category: "еда",
          limit: 1000,
          expenses: [{ id: "first", amount: 900 }],
        },
      ],
      "еда",
      { id: "second", amount: 500 },
      "unused",
    );
    expect(items[0].limit).toBe(1000);
    expect(stillPlanned(items[0])).toBe(-400);
  });
  it("grows and shrinks an automatic limit with current-period expenses", () => {
    const afterAdd = addEverydayExpense(
      [
        {
          id: "limit",
          category: "еда",
          limit: 50,
          automatic: true,
          expenses: [{ id: "first", amount: 50 }],
        },
      ],
      "еда",
      { id: "second", amount: 100 },
      "unused",
    );
    expect(afterAdd[0].limit).toBe(150);
    const afterDelete = recalculateAutomaticEverydayLimits([
      { ...afterAdd[0], expenses: [{ id: "first", amount: 50 }] },
    ]);
    expect(afterDelete[0].limit).toBe(50);
    expect(
      syncAutomaticEverydaySettings([], period({ everyday: afterDelete }))[0],
    ).toMatchObject({ category: "еда", limit: 50, automatic: true });
  });
  it("keeps a fixed limit and subtracts actual overspending", () => {
    const p = period({
      income: 10000,
      previousBalance: 0,
      everyday: [
        {
          id: "limit",
          category: "покупки",
          limit: 2000,
          automatic: false,
          expenses: [{ id: "expense", amount: 2500 }],
        },
      ],
    });
    expect(stillPlanned(p.everyday[0])).toBe(-500);
    expect(freeMoney(p)).toBe(7500);
  });
  it("suggests only a positive previous-period balance", () => {
    expect(suggestedPreviousBalance(period({ income: 1000 }))).toBe(0);
    expect(
      suggestedPreviousBalance(
        period({ income: 10000, previousBalance: 0, mandatory: [] }),
      ),
    ).toBe(10000);
  });
  it("formats only five digit values with separators", () => {
    expect(formatAmount(9999)).toBe("9999");
    expect(formatAmount(10000)).toBe("10 000");
  });
  it("rejects an invalid backup structure", () => {
    expect(validBackup({ version: 1, categories: [], drafts: [] })).toBe(false);
  });
  it("uses the confirmed category-to-expense-type mapping", () => {
    expect(defaultCategoryTypes["еда"]).toEqual(["everyday", "impulse"]);
    expect(defaultCategoryTypes["услуги"]).toEqual(["oneOff"]);
    expect(categoriesFor(emptyData(), "mandatory")).toContain("сплит");
  });
  it("uses the confirmed initial category order", () => {
    expect(emptyData().categories).toEqual([
      "аренда",
      "еда",
      "транспорт",
      "дом и гигиена",
      "красота",
      "падел",
      "покупки",
      "здоровье",
      "развлечения",
      "подписки",
      "регулярные платежи",
      "услуги",
      "сплит",
      "долг",
    ]);
  });
  it("translates previously saved English categories", () => {
    const migrated = normalizeData({
      version: 1,
      categories: ["food", "split"],
      drafts: [{ id: "d", category: "split", amount: 1000 }],
      periods: [
        period({
          everyday: [{ id: "e", category: "food", limit: 1000, expenses: [] }],
        }),
      ],
    });
    expect(migrated.categories).toContain("еда");
    expect(migrated.drafts[0].category).toBe("сплит");
    expect(migrated.periods[0].everyday[0].category).toBe("еда");
    expect(migrated.everydayLimits).toEqual([
      { id: "e", category: "еда", limit: 1000 },
    ]);
    expect(migrated.wishlist).toEqual([]);
  });
  it("does not restore a category that the user deleted", () => {
    const data = normalizeData({
      version: 1,
      categories: ["еда"],
      categoryTypes: { еда: ["everyday"] },
      drafts: [],
      periods: [],
    });
    expect(data.categories).toEqual(["еда"]);
  });
  it("recognises a legacy limit created from matching current spending", () => {
    const migrated = normalizeData({
      version: 1,
      categories: ["еда"],
      categoryTypes: { еда: ["everyday"] },
      everydayLimits: [{ id: "setting", category: "еда", limit: 50 }],
      drafts: [],
      periods: [
        period({
          everyday: [
            {
              id: "limit",
              category: "еда",
              limit: 50,
              expenses: [{ id: "expense", amount: 50 }],
            },
          ],
        }),
      ],
    });
    expect(migrated.everydayLimits[0].automatic).toBe(true);
    expect(migrated.periods[0].everyday[0].automatic).toBe(true);
  });
  it("keeps salary day active and finishes the period the next day", () => {
    const current = period({ nextSalaryDate: "2026-08-04" });
    expect(periodState(current, "2026-08-03")).toBe("active");
    expect(periodState(current, "2026-08-04")).toBe("salary-day");
    expect(periodState(current, "2026-08-05")).toBe("finished");
  });
});
