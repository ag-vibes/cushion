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
});
