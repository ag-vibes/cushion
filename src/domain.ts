export type ExpenseKind = "mandatory" | "everyday" | "oneOff" | "impulse";

export const defaultCategoryTypes: Record<string, ExpenseKind[]> = {
  еда: ["everyday", "impulse"],
  транспорт: ["everyday", "oneOff"],
  "дом и гигиена": ["everyday"],
  падел: ["everyday"],
  красота: ["mandatory", "oneOff"],
  здоровье: ["everyday", "oneOff"],
  покупки: ["everyday", "oneOff", "impulse"],
  развлечения: ["oneOff"],
  аренда: ["mandatory"],
  подписки: ["mandatory"],
  "регулярные платежи": ["mandatory"],
  сплит: ["mandatory"],
  долг: ["mandatory"],
  услуги: ["oneOff"],
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
  expenses: { id: string; amount: number }[];
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
export type AppData = {
  version: 1;
  categories: string[];
  categoryTypes: Record<string, ExpenseKind[]>;
  drafts: Draft[];
  periods: Period[];
};
export const emptyData = (): AppData => ({
  version: 1,
  categories: [...initialCategories],
  categoryTypes: structuredClone(defaultCategoryTypes),
  drafts: [],
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
  const expense = (item: Expense): Expense => ({
    ...item,
    category: translateCategory(item.category),
  });
  return {
    version: 1,
    categories,
    categoryTypes,
    drafts: (source.drafts ?? []).map((item) => ({
      ...item,
      category: translateCategory(item.category),
    })),
    periods: (source.periods ?? []).map((period) => ({
      ...period,
      mandatory: period.mandatory.map(expense),
      everyday: period.everyday.map((item) => ({
        ...item,
        category: translateCategory(item.category),
      })),
      oneOff: period.oneOff.map(expense),
      impulse: period.impulse.map(expense),
    })),
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
export const freeMoney = (p: Period) =>
  p.income +
  p.previousBalance -
  p.mandatory.reduce((s, e) => s + e.amount, 0) -
  p.everyday.reduce((s, e) => s + spent(e) + stillPlanned(e), 0) -
  p.oneOff.reduce((s, e) => s + e.amount, 0) -
  p.impulse.reduce((s, e) => s + e.amount, 0);
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
export type ExpenseKind = "mandatory" | "everyday" | "oneOff" | "impulse";

export const defaultCategoryTypes: Record<string, ExpenseKind[]> = {
  еда: ["everyday", "impulse"],
  транспорт: ["everyday", "oneOff"],
  "дом и гигиена": ["everyday"],
  падел: ["everyday"],
  красота: ["mandatory", "oneOff"],
  здоровье: ["everyday", "oneOff"],
  покупки: ["everyday", "oneOff", "impulse"],
  развлечения: ["oneOff"],
  аренда: ["mandatory"],
  подписки: ["mandatory"],
  "регулярные платежи": ["mandatory"],
  сплит: ["mandatory"],
  долг: ["mandatory"],
  услуги: ["oneOff"],
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
  expenses: { id: string; amount: number }[];
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
export type AppData = {
  version: 1;
  categories: string[];
  categoryTypes: Record<string, ExpenseKind[]>;
  drafts: Draft[];
  periods: Period[];
};
export const emptyData = (): AppData => ({
  version: 1,
  categories: [...initialCategories],
  categoryTypes: structuredClone(defaultCategoryTypes),
  drafts: [],
  periods: [],
});

export const normalizeData = (raw: unknown): AppData => {
  const source = raw as Partial<AppData>;
  const sourceCategories = Array.isArray(source?.categories)
    ? source.categories
    : initialCategories;
  const categories = Array.from(
    new Set([...sourceCategories.map(translateCategory), ...initialCategories]),
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
  const expense = (item: Expense): Expense => ({
    ...item,
    category: translateCategory(item.category),
  });
  return {
    version: 1,
    categories,
    categoryTypes,
    drafts: (source.drafts ?? []).map((item) => ({
      ...item,
      category: translateCategory(item.category),
    })),
    periods: (source.periods ?? []).map((period) => ({
      ...period,
      mandatory: period.mandatory.map(expense),
      everyday: period.everyday.map((item) => ({
        ...item,
        category: translateCategory(item.category),
      })),
      oneOff: period.oneOff.map(expense),
      impulse: period.impulse.map(expense),
    })),
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
export const freeMoney = (p: Period) =>
  p.income +
  p.previousBalance -
  p.mandatory.reduce((s, e) => s + e.amount, 0) -
  p.everyday.reduce((s, e) => s + spent(e) + stillPlanned(e), 0) -
  p.oneOff.reduce((s, e) => s + e.amount, 0) -
  p.impulse.reduce((s, e) => s + e.amount, 0);
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
