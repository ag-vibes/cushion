export type ExpenseKind = "mandatory" | "everyday" | "oneOff" | "impulse";

export const defaultCategoryTypes: Record<string, ExpenseKind[]> = {
  аренда: ["mandatory"],
  еда: ["everyday", "impulse"],
  транспорт: ["everyday", "oneOff"],
  "дом и гигиена": ["everyday"],
  красота: ["mandatory", "oneOff"],
  падел: ["everyday"],
  покупки: ["everyday", "oneOff", "impulse"],
  здоровье: ["everyday", "oneOff"],
  развлечения: ["oneOff"],
  подписки: ["mandatory"],
  "регулярные платежи": ["mandatory"],
  услуги: ["oneOff"],
  сплит: ["mandatory"],
  долг: ["mandatory"],
};
export const initialCategories = Object.keys(defaultCategoryTypes);

const categoryTranslations: Record<string, string> = {
  food: "еда",
  transport: "транспорт",
  "home & hygiene": "дом и гигиена",
  padel: "падел",
  beauty: "красота",
  health: "здоровье",
  shopping: "покупки",
  entertainment: "развлечения",
  rent: "аренда",
  subscriptions: "подписки",
  "regular payments": "регулярные платежи",
  split: "сплит",
  debt: "долг",
};
const translateCategory = (category: string) =>
  categoryTranslations[category] ?? category;

export type Status = "предстоит" | "оплачено";
export type Expense = {
  id: string;
  category: string;
  amount: number;
  status?: Status;
  date?: string;
};
export type EverydayLimit = {
  id: string;
  category: string;
  limit: number;
  automatic?: boolean;
  expenses: {
    id: string;
    amount: number;
    createdAt?: string;
    date?: string;
  }[];
};
export type Period = {
  id: string;
  startDate: string;
  nextSalaryDate: string;
  income: number;
  previousBalance: number;
  current: boolean;
  createdAt: string;
  mandatory: Expense[];
  everyday: EverydayLimit[];
  oneOff: Expense[];
  impulse: Expense[];
};
export type Draft = {
  id: string;
  category: string;
  amount: number;
  lastPaymentDate?: string;
};
export type EverydayLimitSetting = {
  id: string;
  category: string;
  limit: number;
  automatic?: boolean;
};
export type WishlistItem = {
  id: string;
  name: string;
  amount: number;
};
export type AppData = {
  version: 1;
  lastBackupDate?: string;
  categories: string[];
  categoryTypes: Record<string, ExpenseKind[]>;
  everydayLimits: EverydayLimitSetting[];
  drafts: Draft[];
  wishlist: WishlistItem[];
  periods: Period[];
};
export const emptyData = (): AppData => ({
  version: 1,
  categories: [...initialCategories],
  categoryTypes: structuredClone(defaultCategoryTypes),
  everydayLimits: [],
  drafts: [],
  wishlist: [],
  periods: [],
});

export const normalizeData = (raw: unknown): AppData => {
  const source = raw as Partial<AppData>;
  const sourceCategories = Array.isArray(source?.categories)
    ? source.categories
    : initialCategories;
  const isLegacyList = sourceCategories.some(
    (category) => categoryTranslations[category],
  );
  const categories = Array.from(
    new Set([
      ...sourceCategories.map(translateCategory),
      ...(isLegacyList ? initialCategories : []),
    ]),
  );
  const existingTypes = source?.categoryTypes ?? {};
  const categoryTypes: Record<string, ExpenseKind[]> = {
    ...structuredClone(defaultCategoryTypes),
  };
  Object.entries(existingTypes).forEach(([category, types]) => {
    if (Array.isArray(types))
      categoryTypes[translateCategory(category)] = types;
  });
  categories.forEach((category) => {
    categoryTypes[category] ??= ["mandatory", "everyday", "oneOff", "impulse"];
  });
  const currentSourcePeriod = (source.periods ?? []).find(
    (period) => period.current,
  );
  const likelyAutomaticCategories = new Set(
    Array.isArray(source.everydayLimits)
      ? source.everydayLimits
          .filter((setting) => {
            if (setting.automatic !== undefined) return false;
            const item = currentSourcePeriod?.everyday.find(
              (limit) => limit.category === setting.category,
            );
            return (
              item !== undefined &&
              item.expenses.length > 0 &&
              item.limit ===
                item.expenses.reduce(
                  (sum, expenseItem) => sum + expenseItem.amount,
                  0,
                ) &&
              item.limit === setting.limit
            );
          })
          .map((setting) => translateCategory(setting.category))
      : [],
  );
  const expense = (item: Expense): Expense => ({
    ...item,
    category: translateCategory(item.category),
  });
  const periods = (source.periods ?? []).map((period) => ({
    ...period,
    mandatory: period.mandatory.map(expense),
    everyday: period.everyday.map((item) => ({
      ...item,
      category: translateCategory(item.category),
      automatic:
        item.automatic === true ||
        likelyAutomaticCategories.has(translateCategory(item.category)),
    })),
    oneOff: period.oneOff.map(expense),
    impulse: period.impulse.map(expense),
  }));
  const legacyLimitSource =
    periods.find((period) => period.current)?.everyday ??
    periods[periods.length - 1]?.everyday ??
    [];
  const everydayLimits = Array.isArray(source.everydayLimits)
    ? source.everydayLimits.map((item) => ({
        ...item,
        category: translateCategory(item.category),
        automatic:
          item.automatic === true ||
          likelyAutomaticCategories.has(translateCategory(item.category)),
      }))
    : legacyLimitSource
        .filter((item) => item.limit > 0)
        .map(({ id, category, limit }) => ({ id, category, limit }));
  return {
    version: 1,
    ...(typeof source.lastBackupDate === "string"
      ? { lastBackupDate: source.lastBackupDate }
      : {}),
    categories,
    categoryTypes,
    everydayLimits,
    drafts: (source.drafts ?? []).map((item) => ({
      ...item,
      category: translateCategory(item.category),
    })),
    wishlist: Array.isArray(source.wishlist)
      ? source.wishlist.filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.amount === "number",
        )
      : [],
    periods,
  };
};

export const categoriesFor = (data: AppData, kind: ExpenseKind) =>
  data.categories.filter((category) =>
    data.categoryTypes[category]?.includes(kind),
  );
export const uid = () => crypto.randomUUID();
export const spent = (item: EverydayLimit) =>
  item.expenses.reduce((s, e) => s + e.amount, 0);
export const stillPlanned = (item: EverydayLimit) => item.limit - spent(item);
export const addEverydayExpense = (
  items: EverydayLimit[],
  category: string,
  expense: {
    id: string;
    amount: number;
    createdAt?: string;
    date?: string;
  },
  newLimitId: string,
) => {
  const target = items.find((item) => item.category === category);
  if (!target)
    return [
      ...items,
      {
        id: newLimitId,
        category,
        limit: expense.amount,
        automatic: true,
        expenses: [expense],
      },
    ];
  return items.map((item) =>
    item.id === target.id
      ? (() => {
          const expenses = [...item.expenses, expense];
          return {
            ...item,
            limit: item.automatic
              ? expenses.reduce((sum, entry) => sum + entry.amount, 0)
              : item.limit,
            expenses,
          };
        })()
      : item,
  );
};
export const recalculateAutomaticEverydayLimits = (
  items: EverydayLimit[],
) =>
  items.map((item) =>
    item.automatic ? { ...item, limit: spent(item) } : item,
  );
export const syncAutomaticEverydaySettings = (
  settings: EverydayLimitSetting[],
  period: Period,
) => {
  const next = [...settings];
  period.everyday
    .filter((item) => item.automatic)
    .forEach((item) => {
      const existing = next.find(
        (setting) => setting.category === item.category,
      );
      if (existing) {
        const index = next.indexOf(existing);
        next[index] = {
          ...existing,
          limit: item.limit,
          automatic: true,
        };
      } else {
        next.push({
          id: item.id,
          category: item.category,
          limit: item.limit,
          automatic: true,
        });
      }
    });
  return next;
};
export const freeMoney = (p: Period) =>
  p.income +
  p.previousBalance -
  p.mandatory.reduce((s, e) => s + e.amount, 0) -
  p.everyday.reduce((s, e) => s + Math.max(e.limit, spent(e)), 0) -
  p.oneOff.reduce((s, e) => s + e.amount, 0) -
  p.impulse.reduce((s, e) => s + e.amount, 0);
export const suggestedPreviousBalance = (period?: Period) =>
  period ? Math.max(0, freeMoney(period)) : 0;
export const formatAmount = (n: number) => {
  const rounded = Math.round(n);
  return Math.abs(rounded) >= 10000
    ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
        .format(rounded)
        .replace(/\u00a0/g, " ")
    : String(rounded);
};
export const daysUntil = (date: string) =>
  Math.max(
    0,
    Math.ceil(
      (new Date(date + "T00:00:00").getTime() -
        new Date().setHours(0, 0, 0, 0)) /
        86400000,
    ),
  );
export type PeriodState = "active" | "salary-day" | "finished";
export const periodState = (period: Period, today: string): PeriodState => {
  if (today < period.nextSalaryDate) return "active";
  if (today === period.nextSalaryDate) return "salary-day";
  return "finished";
};
export const settleScheduledOneOffExpenses = (
  data: AppData,
  today: string,
): AppData => {
  let changed = false;
  const periods = data.periods.map((period) => {
    if (!period.current) return period;
    const oneOff = period.oneOff.map((expense) => {
      if (
        expense.status === "предстоит" &&
        expense.date &&
        expense.date <= today
      ) {
        changed = true;
        return { ...expense, status: "оплачено" as const, date: undefined };
      }
      return expense;
    });
    return changed ? { ...period, oneOff } : period;
  });
  return changed ? { ...data, periods } : data;
};
export const validBackup = (v: unknown): v is AppData => {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<AppData>;
  return (
    d.version === 1 &&
    Array.isArray(d.categories) &&
    d.categories.every((x) => typeof x === "string") &&
    Array.isArray(d.drafts) &&
    Array.isArray(d.periods)
  );
};
