export const initialCategories = [
  "food",
  "transport",
  "home & hygiene",
  "padel",
  "beauty",
  "health",
  "shopping",
  "entertainment",
  "rent",
  "subscriptions",
  "regular payments",
  "split",
  "debt",
];
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
  drafts: Draft[];
  periods: Period[];
};
export const emptyData = (): AppData => ({
  version: 1,
  categories: [...initialCategories],
  drafts: [],
  periods: [],
});
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
