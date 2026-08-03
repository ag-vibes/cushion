import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  actualExpenseTotals,
  addEverydayExpense,
  averageDailyExpense,
  categoriesFor,
  daysUntil,
  formatAmount,
  freeMoney,
  normalizeData,
  periodState,
  recalculateAutomaticEverydayLimits,
  settleScheduledExpenses,
  salaryCountdownLabel,
  sortPlannedExpenses,
  spent,
  stillPlanned,
  suggestedPreviousBalance,
  syncAutomaticEverydaySettings,
  totalActualExpenses,
  uid,
  validBackup,
  type AppData,
  type EverydayLimit,
  type Expense,
  type ExpenseKind,
  type Period,
  type WishlistItem,
} from "./domain";
import { IndexedDbStorage } from "./storage";
type Page =
  | "home"
  | "period"
  | "more"
  | "add"
  | "create"
  | "categories"
  | "wishlist"
  | "history"
  | "backup";
const storage = new IndexedDbStorage();
const todayIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
const money = (n: number) => <>{formatAmount(n)} ₽</>;
const dateLabel = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
const backupDateLabel = (s: string) => `${dateLabel(s)} ${s.slice(0, 4)}`;
const expenseMomentLabel = (createdAt: string) => {
  const date = new Date(createdAt);
  const day = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  const time = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} ${time}`;
};
const num = (v: FormDataEntryValue | null) =>
  Number(
    String(v ?? "")
      .replaceAll(" ", "")
      .replace(",", "."),
  );
const formatInputAmount = (value: string) => {
  const negative = value.trim().startsWith("-");
  const digits = value.replace(/\D/g, "");
  const formatted =
    digits.length >= 5 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : digits;
  return negative ? `-${formatted}` : formatted;
};
const formatAmountField = (event: React.FormEvent<HTMLInputElement>) => {
  event.currentTarget.value = formatInputAmount(event.currentTarget.value);
};
export const formatDateInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join(".");
};
const toRuDate = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}.${month}.${year}` : "";
};
export const fromRuDate = (value: string) => {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00`);
  return date.getFullYear() === Number(year) &&
    date.getMonth() + 1 === Number(month) &&
    date.getDate() === Number(day)
    ? iso
    : "";
};
const validateAmount = (n: number, negative = false) =>
  Number.isFinite(n) && (negative || n >= 0);

function DateInput({
  value,
  onChange,
  name,
  ariaLabel,
  autoFocus,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <input
      autoFocus={autoFocus}
      name={name}
      inputMode="numeric"
      placeholder="дд.мм.гггг"
      aria-label={ariaLabel}
      required={required}
      value={value}
      onChange={(event) => onChange(formatDateInput(event.target.value))}
    />
  );
}

export function App() {
  const [data, setData] = useState<AppData>();
  const [page, setPage] = useState<Page>("home");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    storage.load().then((loaded) => {
      const settled = settleScheduledExpenses(loaded, todayIso());
      setData(settled);
      if (settled !== loaded) storage.save(settled);
    });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setData((current) => {
        if (!current) return current;
        const settled = settleScheduledExpenses(current, todayIso());
        if (settled !== current) storage.save(settled);
        return settled;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  const update = (next: AppData, msg = "") => {
    const settled = settleScheduledExpenses(next, todayIso());
    setData(settled);
    storage.save(settled);
    if (msg) {
      setNotice(msg);
      setTimeout(() => setNotice(""), 2500);
    }
  };
  if (!data) return <main className="center">загрузка…</main>;
  const current = data.periods.find((p) => p.current);
  const currentState = current ? periodState(current, todayIso()) : undefined;
  const morePages: Page[] = [
    "more",
    "categories",
    "wishlist",
    "history",
    "backup",
  ];
  const body =
    page === "create" ? (
      <CreatePeriod
        data={data}
        onSave={(p) => {
          update(
            {
              ...data,
              everydayLimits: data.everydayLimits
                .filter((item) => !item.automatic || item.limit > 0)
                .map((item) => ({
                  ...item,
                  automatic: false,
                })),
              periods: [
                ...data.periods.map((x) => ({ ...x, current: false })),
                p,
              ],
            },
            "период создан",
          );
          setPage("home");
        }}
        onCancel={() => setPage(current ? "period" : "home")}
      />
    ) : page === "add" && current && currentState !== "finished" ? (
      <AddExpense
        data={data}
        period={current}
        save={update}
        done={() => setPage("home")}
      />
    ) : page === "period" ? (
      <PeriodScreen data={data} period={current} save={update} go={setPage} />
    ) : page === "more" ? (
      <More go={setPage} />
    ) : page === "categories" ? (
      <Categories data={data} save={update} back={() => setPage("more")} />
    ) : page === "wishlist" ? (
      <Wishlist data={data} save={update} back={() => setPage("more")} />
    ) : page === "history" ? (
      <History
        periods={data.periods.filter((p) => !p.current)}
        everydayOrder={data.everydayCategoryOrder ?? data.categories}
        back={() => setPage("more")}
      />
    ) : page === "backup" ? (
      <Backup
        data={data}
        save={update}
        restore={(d) => {
          update(d, "резервная копия восстановлена");
          setPage("more");
        }}
        back={() => setPage("more")}
      />
    ) : (
      <Home
        period={current}
        go={setPage}
        categoryOrder={data.everydayCategoryOrder ?? data.categories}
        onChange={(period) =>
          update(
            {
              ...data,
              periods: data.periods.map((item) =>
                item.id === period.id ? period : item,
              ),
            },
            "статус расхода изменён",
          )
        }
      />
    );
  return (
    <div className="app">
      <header>
        <span className="brand">cushion</span>
      </header>
      {notice && <div className="notice">{notice}</div>}
      <main>{body}</main>
      {!["create", "add"].includes(page) && (
        <nav>
          <button
            className={page === "home" ? "active" : ""}
            onClick={() => setPage("home")}
          >
            главная
          </button>
          <button
            className={page === "period" ? "active" : ""}
            onClick={() => setPage("period")}
          >
            период
          </button>
          <button
            className={morePages.includes(page) ? "active" : ""}
            onClick={() => setPage("more")}
          >
            ещё
          </button>
        </nav>
      )}
    </div>
  );
}

export function Home({
  period,
  go,
  categoryOrder,
  onChange,
}: {
  period?: Period;
  go: (p: Page) => void;
  categoryOrder?: string[];
  onChange?: (period: Period) => void;
}) {
  if (!period)
    return (
      <section className="empty hero empty-period empty-period-home">
        <img
          className="empty-mascot"
          src={`${import.meta.env.BASE_URL}mascot.svg`}
          alt=""
          aria-hidden="true"
        />
        <h1>пока нет финансового периода</h1>
        <p>начните планировать расходы до следующей зарплаты</p>
        <button className="primary empty-cta" onClick={() => go("create")}>
          создать период
        </button>
      </section>
    );
  const state = periodState(period, todayIso());
  const finished = state === "finished";
  const availableMoney = freeMoney(period);
  const hasFreeMoney = availableMoney > 0;
  return (
    <>
      {finished && (
        <section className="period-finished" aria-label="период завершён">
          <h2>период завершён</h2>
          <p>создайте новый период, чтобы продолжить учитывать расходы</p>
          <button className="primary" onClick={() => go("create")}>
            создать период
          </button>
        </section>
      )}
      <section className="hero">
        <img
          className="hero-mascot"
          src={`${import.meta.env.BASE_URL}${
            hasFreeMoney ? "mascot.svg" : "mascot-no-money.svg"
          }`}
          alt=""
          aria-hidden="true"
        />
        <p className="period-meta">
          <span>
            {dateLabel(period.startDate)} — {dateLabel(period.nextSalaryDate)}
          </span>
          <span>{salaryCountdownLabel(daysUntil(period.nextSalaryDate))}</span>
        </p>
        <h1 className={hasFreeMoney ? "" : "no-free-money"}>
          {money(availableMoney)}
        </h1>
        <span className={`money-label ${hasFreeMoney ? "" : "no-free-money"}`}>
          {hasFreeMoney ? "свободные деньги" : "свободных денег нет"}
        </span>
      </section>
      {!finished && (
        <div className="home-actions">
          <button className="primary" onClick={() => go("add")}>
            добавить расход
          </button>
          {state === "salary-day" && (
            <button className="secondary" onClick={() => go("create")}>
              создать следующий период
            </button>
          )}
        </div>
      )}
      <Groups
        p={period}
        categoryOrder={categoryOrder}
        statusEditable={!finished}
        onChange={onChange}
      />
      <PeriodTotals period={period} today={todayIso()} />
    </>
  );
}
function Groups({
  p,
  editable,
  statusEditable,
  onChange,
  categoryOrder,
}: {
  p: Period;
  editable?: boolean;
  statusEditable?: boolean;
  onChange?: (p: Period) => void;
  categoryOrder?: string[];
}) {
  const [expandedEveryday, setExpandedEveryday] = useState<string[]>([]);
  const [amountEdit, setAmountEdit] = useState<{
    title: string;
    value: number;
    apply: (amount: number) => void;
  }>();
  const [expenseEdit, setExpenseEdit] = useState<{
    expense: Expense;
    group: "mandatory" | "oneOff" | "impulse";
  }>();
  const [pendingDelete, setPendingDelete] = useState<{
    category: string;
    apply: () => void;
  }>();
  const status = (e: Expense) => {
    if (e.status !== "предстоит") return null;
    const interactive = (editable || statusEditable) && onChange;
    const className = "status planned";
    return interactive ? (
      <button
        className={className}
        onClick={() =>
          onChange({
            ...p,
            mandatory: p.mandatory.map((x) =>
              x.id === e.id
                ? { ...x, status: "оплачено", date: todayIso() }
                : x,
            ),
          })
        }
      >
        предстоит
      </button>
    ) : (
      <span className={className}>предстоит</span>
    );
  };
  const editAmount = (
    title: string,
    value: number,
    apply: (n: number) => void,
  ) => setAmountEdit({ title, value, apply });
  const row = (e: Expense, group: "mandatory" | "oneOff" | "impulse") => (
    <div className="row" key={e.id}>
      <span>
        {e.category}
        {e.name && <small>{e.name}</small>}
        {e.status === "предстоит" && e.date && (
          <small>{dateLabel(e.date)}</small>
        )}
      </span>
      <span className="expense-trailing">
        {group === "mandatory" && status(e)}
        {money(e.amount)}
        {editable && (
          <>
            <button
              className="icon"
              aria-label={`изменить расход ${e.category}`}
              onClick={() => {
                setExpenseEdit({ expense: e, group });
              }}
            >
              ✎
            </button>
            <button
              className="icon"
              aria-label={`удалить расход ${e.category}`}
              onClick={() =>
                setPendingDelete({
                  category: e.category,
                  apply: () =>
                    onChange?.({
                      ...p,
                      [group]: p[group].filter((x) => x.id !== e.id),
                    }),
                })
              }
            >
              ×
            </button>
          </>
        )}
      </span>
    </div>
  );
  const categoryPosition = (category: string) => {
    const position = categoryOrder?.indexOf(category) ?? -1;
    return position < 0 ? Number.MAX_SAFE_INTEGER : position;
  };
  const orderedEveryday = <T extends { category: string }>(items: T[]) =>
    [...items].sort(
      (left, right) =>
        categoryPosition(left.category) - categoryPosition(right.category),
    );
  const everydayCategories = orderedEveryday(
    p.everyday.filter((item) => item.expenses.length > 0),
  );
  const everydayExpenseRow = (expense: {
    id: string;
    category: string;
    amount: number;
    createdAt?: string;
    date?: string;
  }) => (
    <div className="row everyday-expense-detail" key={expense.id}>
      <span>
        {expense.createdAt ? (
          <small>{expenseMomentLabel(expense.createdAt)}</small>
        ) : (
          expense.date && <small>{dateLabel(expense.date)}</small>
        )}
      </span>
      <span>
        {money(expense.amount)}{" "}
        <button
          className="icon"
          aria-label={`изменить расход ${expense.category}`}
          onClick={() =>
            editAmount(expense.category, expense.amount, (amount) =>
              onChange?.({
                ...p,
                everyday: recalculateAutomaticEverydayLimits(
                  p.everyday.map((item) => ({
                    ...item,
                    expenses: item.expenses.map((entry) =>
                      entry.id === expense.id ? { ...entry, amount } : entry,
                    ),
                  })),
                ),
              }),
            )
          }
        >
          ✎
        </button>
        <button
          className="icon"
          aria-label={`удалить расход ${expense.category}`}
          onClick={() =>
            setPendingDelete({
              category: expense.category,
              apply: () =>
                onChange?.({
                  ...p,
                  everyday: recalculateAutomaticEverydayLimits(
                    p.everyday.map((item) => ({
                      ...item,
                      expenses: item.expenses.filter(
                        (entry) => entry.id !== expense.id,
                      ),
                    })),
                  ),
                }),
            })
          }
        >
          ×
        </button>
      </span>
    </div>
  );
  return (
    <>
      <div className="groups">
        <Group
          title="запланированные расходы"
          empty="запланированных расходов пока нет"
        >
          {sortPlannedExpenses(p.mandatory).map((e) => row(e, "mandatory"))}
        </Group>
        <section className="card">
          <h2>повседневные расходы</h2>
          {editable ? (
            everydayCategories.length ? (
              everydayCategories.map((item) => {
                const expanded = expandedEveryday.includes(item.category);
                return (
                  <div className="everyday-history-group" key={item.id}>
                    <button
                      type="button"
                      className="row everyday-history-summary"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedEveryday((current) =>
                          expanded
                            ? current.filter(
                                (category) => category !== item.category,
                              )
                            : [...current, item.category],
                        )
                      }
                    >
                      <span>{item.category}</span>
                      <span>{money(spent(item))}</span>
                    </button>
                    {expanded && (
                      <div className="everyday-expense-list">
                        {[...item.expenses]
                          .sort((left, right) =>
                            (left.createdAt ?? left.date ?? "").localeCompare(
                              right.createdAt ?? right.date ?? "",
                            ),
                          )
                          .map((expense) =>
                            everydayExpenseRow({
                              ...expense,
                              category: item.category,
                            }),
                          )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="muted">повседневных расходов не было</p>
            )
          ) : p.everyday.length === 0 ? (
            <p className="muted">повседневные лимиты не заданы</p>
          ) : null}
          {!editable &&
            orderedEveryday(p.everyday).map((e) => {
              const usage = e.limit > 0 ? (spent(e) / e.limit) * 100 : 0;
              const progressTone =
                usage > 90 ? "danger" : usage >= 70 ? "warning" : "safe";
              const remaining = stillPlanned(e);
              return (
                <div className="row everyday-row" key={e.id}>
                  <span>
                    {e.category}
                    <small className="everyday-details">
                      <span>потрачено {formatAmount(spent(e))} ₽</span>
                      <span>запланировано {formatAmount(e.limit)} ₽</span>
                    </small>
                  </span>
                  <span className={remaining < 0 ? "negative" : ""}>
                    {money(remaining)}
                  </span>
                  <span className="category-progress" aria-hidden="true">
                    <i
                      className={progressTone}
                      style={{ width: `${Math.min(Math.max(usage, 0), 100)}%` }}
                    />
                  </span>
                </div>
              );
            })}
        </section>
        <Group title="внеплановые расходы" empty="внеплановых расходов не было">
          {p.oneOff.map((e) => row(e, "oneOff"))}
        </Group>
        <Group
          title="импульсивные покупки"
          empty="импульсивных покупок не было"
        >
          {p.impulse.map((e) => row(e, "impulse"))}
        </Group>
      </div>
      {amountEdit && (
        <AmountModal
          title={amountEdit.title}
          initial={amountEdit.value}
          requirePositive
          close={() => setAmountEdit(undefined)}
          save={(amount) => {
            amountEdit.apply(amount);
            setAmountEdit(undefined);
          }}
        />
      )}
      {expenseEdit && (
        <ExpenseEditModal
          expense={expenseEdit.expense}
          group={expenseEdit.group}
          periodEnd={p.nextSalaryDate}
          close={() => setExpenseEdit(undefined)}
          save={(name, amount, date) => {
            onChange?.({
              ...p,
              [expenseEdit.group]: p[expenseEdit.group].map((item) =>
                item.id === expenseEdit.expense.id
                  ? {
                      ...item,
                      name,
                      amount,
                      date,
                      ...(expenseEdit.group === "mandatory" &&
                      date === todayIso()
                        ? { status: "оплачено" as const }
                        : {}),
                    }
                  : item,
              ),
            });
            setExpenseEdit(undefined);
          }}
        />
      )}
      {pendingDelete && (
        <Modal
          title="удалить расход?"
          onClose={() => setPendingDelete(undefined)}
        >
          <div className="actions-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setPendingDelete(undefined)}
            >
              отмена
            </button>
            <button
              className="danger-action"
              onClick={() => {
                pendingDelete.apply();
                setPendingDelete(undefined);
              }}
            >
              удалить
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {Array.isArray(children) && children.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

function PeriodTotals({ period, today }: { period: Period; today: string }) {
  return (
    <section className="card period-totals" aria-label="итоги периода">
      <div className="row">
        <span>расходы за период</span>
        <span>{money(totalActualExpenses(period))}</span>
      </div>
      <div className="row">
        <span>средний расход в день</span>
        <span>{money(averageDailyExpense(period, today))}</span>
      </div>
    </section>
  );
}

export function SettingsRow({
  label,
  meta,
  trailing,
}: {
  label: React.ReactNode;
  meta?: React.ReactNode;
  trailing: React.ReactNode;
}) {
  return (
    <div className="row settings-row">
      <span>
        {label}
        {meta && <small>{meta}</small>}
      </span>
      <span className="expense-trailing">{trailing}</span>
    </div>
  );
}

export function CreatePeriod({
  data,
  onSave,
  onCancel,
}: {
  data: AppData;
  onSave: (p: Period) => void;
  onCancel: () => void;
}) {
  const last = [...data.periods].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  const isFirstPeriod = data.periods.length === 0;
  const [error, setError] = useState("");
  const suggestedBalance = suggestedPreviousBalance(last);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [base, setBase] = useState({
    startDate: toRuDate(todayIso),
    nextSalaryDate: "",
    income: "",
    previousBalance: "",
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const inc = isFirstPeriod ? 0 : num(base.income);
    const bal = isFirstPeriod
      ? num(base.previousBalance)
      : base.previousBalance
        ? num(base.previousBalance)
        : suggestedBalance;
    const startDate = fromRuDate(base.startDate);
    const nextSalaryDate = fromRuDate(base.nextSalaryDate);
    if (!startDate || !nextSalaryDate || nextSalaryDate <= startDate) {
      setError(
        "введите существующие даты; следующая зарплата должна быть позже даты начала",
      );
      return;
    }
    if (!validateAmount(inc) || !validateAmount(bal, true)) {
      setError("проверьте введённые суммы");
      return;
    }
    onSave({
      id: uid(),
      startDate,
      nextSalaryDate,
      income: inc,
      previousBalance: bal,
      current: true,
      createdAt: new Date().toISOString(),
      mandatory: [],
      everyday: data.everydayLimits
        .filter((item) => !item.automatic || item.limit > 0)
        .map((item) => ({
          ...item,
          id: uid(),
          automatic: false,
          expenses: [],
        })),
      oneOff: [],
      impulse: [],
    });
  };
  return (
    <section>
      <Top title="создание периода" back={onCancel} />
      <form className="period-create-form" onSubmit={submit}>
        <div className="card form">
          <h2>основные данные</h2>
          <Field label="дата начала">
            <DateInput
              value={base.startDate}
              onChange={(value) => setBase({ ...base, startDate: value })}
            />
          </Field>
          <Field label="дата следующей зарплаты">
            <DateInput
              value={base.nextSalaryDate}
              onChange={(value) => setBase({ ...base, nextSalaryDate: value })}
            />
          </Field>
          {!isFirstPeriod && (
            <Field
              label="доход в начале периода"
              hint="зарплата и другие деньги, которые уже поступили"
            >
              <input
                inputMode="decimal"
                value={base.income}
                placeholder="0"
                onChange={(e) =>
                  setBase({
                    ...base,
                    income: formatInputAmount(e.target.value),
                  })
                }
              />
            </Field>
          )}
          <Field
            label={isFirstPeriod ? "остаток" : "предыдущий остаток"}
            hint={
              isFirstPeriod
                ? "сколько денег доступно до следующей зарплаты"
                : undefined
            }
          >
            <input
              inputMode="decimal"
              value={base.previousBalance}
              placeholder={formatInputAmount(String(suggestedBalance))}
              onChange={(e) =>
                setBase({
                  ...base,
                  previousBalance: formatInputAmount(e.target.value),
                })
              }
            />
          </Field>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary">создать период</button>
      </form>
    </section>
  );
}

export function AddExpense({
  data,
  period,
  save,
  done,
}: {
  data: AppData;
  period: Period;
  save: (d: AppData, m?: string) => void;
  done: () => void;
}) {
  const [type, setType] = useState("everyday");
  const [category, setCategory] = useState("");
  const [oneOffDate, setOneOffDate] = useState("");
  const [error, setError] = useState("");
  const draftAmount =
    type === "mandatory"
      ? data.drafts.find((draft) => draft.category === category)?.amount
      : undefined;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rawAmount = String(f.get("amount") ?? "").trim();
    const amount = rawAmount ? num(rawAmount) : draftAmount;
    if (amount === undefined) {
      setError("введите сумму");
      return;
    }
    if (!validateAmount(amount)) {
      setError("сумма должна быть числом и не может быть отрицательной");
      return;
    }
    if (amount === 0) {
      setError("сумма расхода должна быть больше нуля");
      return;
    }
    const category = String(f.get("category"));
    const name = String(f.get("name") ?? "")
      .trim()
      .toLowerCase();
    if ((type === "oneOff" || type === "impulse") && !name) {
      setError("введите название");
      return;
    }
    let p = period;
    let everydayLimits = data.everydayLimits;
    if (type === "everyday") {
      const savedLimit = data.everydayLimits.find(
        (item) => item.category === category,
      );
      const baseEveryday = p.everyday.some((item) => item.category === category)
        ? p.everyday
        : [
            ...p.everyday,
            {
              id: uid(),
              category,
              limit: savedLimit?.limit ?? 0,
              automatic: savedLimit?.automatic ?? true,
              expenses: [],
            },
          ];
      p = {
        ...p,
        everyday: addEverydayExpense(
          baseEveryday,
          category,
          { id: uid(), amount, createdAt: new Date().toISOString() },
          uid(),
        ),
      };
      everydayLimits = syncAutomaticEverydaySettings(everydayLimits, p);
    } else {
      const date =
        type === "mandatory"
          ? fromRuDate(oneOffDate)
          : type === "oneOff" || type === "impulse"
            ? todayIso()
            : undefined;
      if (type === "mandatory" && !oneOffDate) {
        setError("укажите дату");
        return;
      }
      if (type === "mandatory" && !date) {
        setError("введите существующую дату");
        return;
      }
      if (
        type === "mandatory" &&
        date &&
        (date < todayIso() || date > period.nextSalaryDate)
      ) {
        setError("дата должна быть не раньше сегодня и не позже конца периода");
        return;
      }
      const expense: Expense = {
        id: uid(),
        category,
        amount,
        ...(name ? { name } : {}),
        status:
          type === "mandatory"
            ? date === todayIso()
              ? "оплачено"
              : "предстоит"
            : undefined,
        date,
      };
      p = {
        ...p,
        [type]: [
          ...(p[type as "mandatory" | "oneOff" | "impulse"] as Expense[]),
          expense,
        ],
      };
    }
    save(
      {
        ...data,
        everydayLimits,
        periods: data.periods.map((x) => (x.id === p.id ? p : x)),
      },
      "расход добавлен",
    );
    done();
  };
  const cats =
    type === "everyday"
      ? categoriesFor(data, "everyday")
      : categoriesFor(data, type as ExpenseKind);
  return (
    <section>
      <Top title="добавить расход" back={done} />
      <form className="card form" onSubmit={submit}>
        <Field label="тип расхода">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setCategory("");
              setOneOffDate("");
            }}
          >
            <option value="mandatory">запланированные расходы</option>
            <option value="everyday">повседневные расходы</option>
            <option value="oneOff">внеплановые расходы</option>
            <option value="impulse">импульсивные покупки</option>
          </select>
        </Field>
        <Field label="категория">
          <select
            name="category"
            required
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="" disabled>
              категория
            </option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="сумма">
          <input
            name="amount"
            inputMode="decimal"
            min="0"
            placeholder={
              draftAmount === undefined
                ? "0"
                : formatInputAmount(String(draftAmount))
            }
            onInput={formatAmountField}
          />
        </Field>
        {(type === "mandatory" || type === "oneOff" || type === "impulse") && (
          <Field
            label={
              type === "mandatory" ? "название (необязательно)" : "название"
            }
          >
            <input
              name="name"
              required={type === "oneOff" || type === "impulse"}
            />
          </Field>
        )}
        {type === "mandatory" && (
          <Field label="дата">
            <DateInput
              name="date"
              value={oneOffDate}
              onChange={setOneOffDate}
              required
            />
          </Field>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary">добавить расход</button>
      </form>
    </section>
  );
}

type PeriodField =
  "startDate" | "nextSalaryDate" | "income" | "previousBalance";

export function PeriodScreen({
  data,
  period,
  save,
  go,
}: {
  data: AppData;
  period?: Period;
  save: (d: AppData, m?: string) => void;
  go: (p: Page) => void;
}) {
  const [editField, setEditField] = useState<PeriodField>();
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");
  const [addingIncome, setAddingIncome] = useState(false);
  const [clearingPeriod, setClearingPeriod] = useState(false);
  if (!period)
    return (
      <section className="empty empty-period">
        <h1>нет текущего периода</h1>
        <button className="primary empty-cta" onClick={() => go("create")}>
          создать период
        </button>
      </section>
    );
  const state = periodState(period, todayIso());
  const finished = state === "finished";
  const change = (p: Period) =>
    save(
      {
        ...data,
        everydayLimits: syncAutomaticEverydaySettings(data.everydayLimits, p),
        periods: data.periods.map((x) => (x.id === p.id ? p : x)),
      },
      "изменения сохранены",
    );
  const fieldLabels: Record<PeriodField, string> = {
    startDate: "дата начала",
    nextSalaryDate: "дата следующей зарплаты",
    income: "доход",
    previousBalance: "предыдущий остаток",
  };
  const openEdit = (field: PeriodField) => {
    setEditField(field);
    setEditError("");
    setEditValue(
      field === "startDate" || field === "nextSalaryDate"
        ? toRuDate(period[field])
        : period[field] === 0
          ? ""
          : formatInputAmount(String(period[field])),
    );
  };
  const saveField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editField) return;
    if (editField === "startDate" || editField === "nextSalaryDate") {
      const date = fromRuDate(editValue);
      if (
        !date ||
        (editField === "startDate" && date >= period.nextSalaryDate) ||
        (editField === "nextSalaryDate" && date <= period.startDate)
      ) {
        setEditError("проверьте дату и границы периода");
        return;
      }
      change({ ...period, [editField]: date });
    } else {
      const amount = num(editValue);
      if (!validateAmount(amount, editField === "previousBalance")) {
        setEditError("проверьте введённую сумму");
        return;
      }
      change({ ...period, [editField]: amount });
    }
    setEditField(undefined);
  };
  const settingRow = (field: PeriodField, value: React.ReactNode) => (
    <SettingsRow
      key={field}
      label={fieldLabels[field]}
      trailing={
        <>
          {value}{" "}
          {(!finished || field === "nextSalaryDate") && (
            <button
              className="icon"
              aria-label={`изменить ${fieldLabels[field]}`}
              onClick={() => openEdit(field)}
            >
              ✎
            </button>
          )}
        </>
      }
    />
  );
  return (
    <>
      {finished && (
        <section
          className="period-finished compact"
          aria-label="период завершён"
        >
          <h2>период завершён</h2>
          <p>данные сохранены и больше не пересчитываются</p>
          <p className="muted">
            если зарплата задержалась, измените её дату ниже
          </p>
        </section>
      )}
      <section className="expense-settings">
        <h2 className="section-title">скорректировать внесённые расходы</h2>
        <Groups
          p={period}
          editable={!finished}
          onChange={finished ? undefined : change}
          categoryOrder={data.everydayCategoryOrder ?? data.categories}
        />
      </section>
      <section className="period-settings">
        <h2 className="section-title">изменить период</h2>
        <div className="card summary">
          {settingRow("startDate", toRuDate(period.startDate))}
          {settingRow("nextSalaryDate", toRuDate(period.nextSalaryDate))}
          {settingRow("income", money(period.income))}
          {settingRow("previousBalance", money(period.previousBalance))}
        </div>
      </section>
      <div className="period-actions">
        {!finished && (
          <button className="secondary" onClick={() => setAddingIncome(true)}>
            добавить доход
          </button>
        )}
        <button className="secondary" onClick={() => setClearingPeriod(true)}>
          очистить текущий период
        </button>
      </div>
      {editField && (
        <Modal
          title={fieldLabels[editField]}
          onClose={() => setEditField(undefined)}
        >
          <form className="form" onSubmit={saveField}>
            {editField === "startDate" || editField === "nextSalaryDate" ? (
              <DateInput autoFocus value={editValue} onChange={setEditValue} />
            ) : (
              <input
                autoFocus
                inputMode="decimal"
                placeholder="0"
                value={editValue}
                onChange={(event) =>
                  setEditValue(formatInputAmount(event.target.value))
                }
              />
            )}
            {editError && <p className="error">{editError}</p>}
            <ModalActions close={() => setEditField(undefined)} />
          </form>
        </Modal>
      )}
      {addingIncome && (
        <AmountModal
          title="добавить доход"
          initial={0}
          close={() => setAddingIncome(false)}
          save={(amount) => {
            if (amount > 0)
              change({ ...period, income: period.income + amount });
            setAddingIncome(false);
          }}
        />
      )}
      {clearingPeriod && (
        <Modal
          title="очистить текущий период?"
          onClose={() => setClearingPeriod(false)}
        >
          <div className="actions-row">
            <button
              className="secondary"
              onClick={() => setClearingPeriod(false)}
            >
              отмена
            </button>
            <button
              className="danger-action"
              onClick={() => {
                save(
                  {
                    ...data,
                    everydayLimits: data.everydayLimits.filter(
                      (item) => !item.automatic,
                    ),
                    periods: data.periods.filter(
                      (item) => item.id !== period.id,
                    ),
                  },
                  "текущий период очищен",
                );
                setClearingPeriod(false);
                go("home");
              }}
            >
              очистить
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function More({ go }: { go: (p: Page) => void }) {
  return (
    <section>
      <div className="menu">
        {[
          ["categories", "настройка категорий"],
          ["wishlist", "вишлист"],
          ["history", "история периодов"],
          ["backup", "резервная копия"],
        ].map(([p, t]) => (
          <button key={p} onClick={() => go(p as Page)}>
            {t}
            <span>›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function Wishlist({
  data,
  save,
  back,
}: {
  data: AppData;
  save: (d: AppData, m?: string) => void;
  back: () => void;
}) {
  const [editing, setEditing] = useState<WishlistItem>();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<WishlistItem>();
  const currentPeriod = data.periods.find((period) => period.current);
  const canComplete =
    currentPeriod && periodState(currentPeriod, todayIso()) !== "finished";
  const orderedWishlist = [...data.wishlist].sort(
    (left, right) =>
      Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt)),
  );

  const ItemForm = ({
    item,
    close,
  }: {
    item?: WishlistItem;
    close: () => void;
  }) => {
    const [name, setName] = useState(item?.name ?? "");
    const [amount, setAmount] = useState(
      item ? formatInputAmount(String(item.amount)) : "",
    );
    const [error, setError] = useState("");
    return (
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedName = name.trim().toLowerCase();
          const parsedAmount = num(amount);
          if (!trimmedName) return setError("введите название");
          if (!validateAmount(parsedAmount) || parsedAmount === 0)
            return setError("проверьте сумму");
          const next = item
            ? data.wishlist.map((entry) =>
                entry.id === item.id
                  ? { ...entry, name: trimmedName, amount: parsedAmount }
                  : entry,
              )
            : [
                ...data.wishlist,
                { id: uid(), name: trimmedName, amount: parsedAmount },
              ];
          save(
            { ...data, wishlist: next },
            item ? "позиция обновлена" : "позиция добавлена в вишлист",
          );
          close();
        }}
      >
        <Field label="название">
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="сумма">
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(event) =>
              setAmount(formatInputAmount(event.target.value))
            }
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <ModalActions close={close} />
      </form>
    );
  };

  return (
    <section>
      <Top title="вишлист" back={back} />
      <div className="card">
        {data.wishlist.length ? (
          orderedWishlist.map((item) => (
            <div
              className={`row settings-row wishlist-row ${
                item.completedAt ? "completed" : ""
              }`}
              key={item.id}
            >
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(item.completedAt)}
                  disabled={Boolean(item.completedAt) || !canComplete}
                  aria-label={`куплено ${item.name}`}
                  onChange={() => {
                    if (!canComplete || item.completedAt) return;
                    const expenseId = uid();
                    const completionDate = todayIso();
                    save(
                      {
                        ...data,
                        wishlist: data.wishlist.map((entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                completedAt: completionDate,
                                expenseId,
                              }
                            : entry,
                        ),
                        periods: data.periods.map((period) =>
                          period.id === currentPeriod.id
                            ? {
                                ...period,
                                oneOff: [
                                  ...period.oneOff,
                                  {
                                    id: expenseId,
                                    category: "покупки",
                                    name: item.name,
                                    amount: item.amount,
                                    date: completionDate,
                                  },
                                ],
                              }
                            : period,
                        ),
                      },
                      "покупка добавлена в расходы",
                    );
                  }}
                />
                <span>{item.name}</span>
              </label>
              <span className="expense-trailing">
                {money(item.amount)}
                {!item.completedAt && (
                  <button
                    className="icon"
                    aria-label={`изменить позицию ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    ✎
                  </button>
                )}
                <button
                  className="icon"
                  aria-label={`удалить позицию ${item.name}`}
                  onClick={() => setDeleting(item)}
                >
                  ×
                </button>
              </span>
            </div>
          ))
        ) : (
          <p className="muted">вишлист пока пуст</p>
        )}
      </div>
      <button className="secondary" onClick={() => setAdding(true)}>
        добавить желание
      </button>
      {adding && (
        <Modal title="добавить в вишлист" onClose={() => setAdding(false)}>
          <ItemForm close={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={editing.name} onClose={() => setEditing(undefined)}>
          <ItemForm item={editing} close={() => setEditing(undefined)} />
        </Modal>
      )}
      {deleting && (
        <Modal
          title="удалить из вишлиста?"
          onClose={() => setDeleting(undefined)}
        >
          <div className="actions-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setDeleting(undefined)}
            >
              отмена
            </button>
            <button
              className="danger-action"
              onClick={() => {
                save(
                  {
                    ...data,
                    wishlist: data.wishlist.filter(
                      (item) => item.id !== deleting.id,
                    ),
                  },
                  "позиция удалена",
                );
                setDeleting(undefined);
              }}
            >
              удалить
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

const expenseTypeOptions: [ExpenseKind, string][] = [
  ["mandatory", "запланированные расходы"],
  ["everyday", "повседневные расходы"],
  ["oneOff", "внеплановые расходы"],
  ["impulse", "импульсивные покупки"],
];

export function Categories({
  data,
  save,
  back,
}: {
  data: AppData;
  save: (d: AppData, m?: string) => void;
  back: () => void;
}) {
  const [order, setOrder] = useState(data.categories);
  const dragged = useRef<string | undefined>(undefined);
  const dragOrder = useRef(data.categories);
  const initialEverydayOrder = (
    data.everydayCategoryOrder ?? data.categories
  ).filter((category) =>
    data.categoryTypes[category]?.includes("everyday"),
  );
  const [everydayOrder, setEverydayOrder] = useState(initialEverydayOrder);
  const draggedEveryday = useRef<string | undefined>(undefined);
  const everydayDragOrder = useRef(initialEverydayOrder);
  const [editing, setEditing] = useState<string>();
  const [deleting, setDeleting] = useState<string>();
  const [editName, setEditName] = useState("");
  const [editTypes, setEditTypes] = useState<ExpenseKind[]>([]);
  const [editError, setEditError] = useState("");
  const [limitCategory, setLimitCategory] = useState<string>();
  const [draftCategory, setDraftCategory] = useState<string>();
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    setOrder(data.categories);
    dragOrder.current = data.categories;
  }, [data.categories]);
  useEffect(() => {
    const next = (data.everydayCategoryOrder ?? data.categories).filter(
      (category) => data.categoryTypes[category]?.includes("everyday"),
    );
    setEverydayOrder(next);
    everydayDragOrder.current = next;
  }, [data.categories, data.categoryTypes, data.everydayCategoryOrder]);
  const typeLabels: Record<ExpenseKind, string> = {
    mandatory: "запланированные",
    everyday: "повседневные",
    oneOff: "внеплановые",
    impulse: "импульсивные",
  };
  const beginEdit = (category: string) => {
    setEditing(category);
    setEditName(category);
    setEditTypes(data.categoryTypes[category] ?? []);
    setEditError("");
  };
  const saveCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const name = editName.trim().toLowerCase();
    if (!name) return setEditError("введите название категории");
    if (!editTypes.length)
      return setEditError("выберите хотя бы один тип расхода");
    if (name !== editing && data.categories.includes(name))
      return setEditError("такая категория уже есть");
    const renameExpense = (expense: Expense) =>
      expense.category === editing ? { ...expense, category: name } : expense;
    const wasEveryday = data.categoryTypes[editing]?.includes("everyday");
    const nextEverydayOrder = (
      data.everydayCategoryOrder ?? categoriesFor(data, "everyday")
    )
      .filter((category) => category !== editing)
      .concat(
        editTypes.includes("everyday")
          ? wasEveryday
            ? []
            : [name]
          : [],
      );
    if (wasEveryday && editTypes.includes("everyday")) {
      const position = (
        data.everydayCategoryOrder ?? categoriesFor(data, "everyday")
      ).indexOf(editing);
      nextEverydayOrder.splice(position < 0 ? nextEverydayOrder.length : position, 0, name);
    }
    save(
      {
        ...data,
        categories: data.categories.map((category) =>
          category === editing ? name : category,
        ),
        everydayCategoryOrder: nextEverydayOrder,
        categoryTypes: Object.fromEntries(
          Object.entries(data.categoryTypes)
            .filter(([category]) => category !== editing)
            .concat([[name, editTypes]]),
        ),
        drafts: data.drafts
          .filter(
            (draft) =>
              draft.category !== editing || editTypes.includes("mandatory"),
          )
          .map((draft) =>
            draft.category === editing ? { ...draft, category: name } : draft,
          ),
        everydayLimits: data.everydayLimits
          .filter(
            (limit) =>
              limit.category !== editing || editTypes.includes("everyday"),
          )
          .map((limit) =>
            limit.category === editing ? { ...limit, category: name } : limit,
          ),
        periods: data.periods.map((period) =>
          period.current
            ? {
                ...period,
                mandatory: period.mandatory.map(renameExpense),
                everyday: period.everyday
                  .filter(
                    (item) =>
                      item.category !== editing ||
                      editTypes.includes("everyday") ||
                      item.expenses.length > 0,
                  )
                  .map((item) =>
                    item.category === editing
                      ? {
                          ...item,
                          category: name,
                          limit: editTypes.includes("everyday")
                            ? item.limit
                            : spent(item),
                        }
                      : item,
                  ),
                oneOff: period.oneOff.map(renameExpense),
                impulse: period.impulse.map(renameExpense),
              }
            : period,
        ),
      },
      "категория изменена",
    );
    setEditing(undefined);
  };
  const addCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("category")).trim().toLowerCase();
    const types = form.getAll("type") as ExpenseKind[];
    if (!types.length) return setAddError("выберите хотя бы один тип расхода");
    if (data.categories.includes(name))
      return setAddError("такая категория уже есть");
    save(
      {
        ...data,
        categories: [...data.categories, name],
        everydayCategoryOrder: types.includes("everyday")
          ? [...(data.everydayCategoryOrder ?? categoriesFor(data, "everyday")), name]
          : data.everydayCategoryOrder ?? categoriesFor(data, "everyday"),
        categoryTypes: { ...data.categoryTypes, [name]: types },
      },
      "категория добавлена",
    );
    setAddError("");
    setAdding(false);
    event.currentTarget.reset();
  };
  const moveDragged = (target: string) => {
    const source = dragged.current;
    if (!source || source === target) return;
    const next = [...dragOrder.current];
    const from = next.indexOf(source);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, source);
    dragOrder.current = next;
    setOrder(next);
  };
  const moveEverydayDragged = (target: string) => {
    const source = draggedEveryday.current;
    if (!source || source === target) return;
    const next = [...everydayDragOrder.current];
    const from = next.indexOf(source);
    const to = next.indexOf(target);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, source);
    everydayDragOrder.current = next;
    setEverydayOrder(next);
  };
  const mandatoryCategories = categoriesFor(data, "mandatory");
  const everydayCategories = everydayOrder;
  return (
    <section>
      <Top title="настройка категорий" back={back} />
      <div className="card settings-card">
        <h2>запланированные расходы</h2>
        {mandatoryCategories.map((category) => {
          const draft = data.drafts.find((item) => item.category === category);
          return (
            <SettingsRow
              key={category}
              label={category}
              trailing={
                <>
                  {money(draft?.amount ?? 0)}{" "}
                  <button
                    className="icon"
                    aria-label={`изменить сумму для категории ${category}`}
                    onClick={() => setDraftCategory(category)}
                  >
                    ✎
                  </button>
                </>
              }
            />
          );
        })}
      </div>
      <div className="card settings-card">
        <h2>повседневные лимиты</h2>
        {everydayCategories.map((category) => {
          const setting = data.everydayLimits.find(
            (item) => item.category === category,
          );
          return (
            <div
              key={category}
              className="row category-row"
              data-everyday-category={category}
            >
              <button
                className="drag-handle"
                aria-label={`переместить повседневную категорию ${category}`}
                onPointerDown={(event) => {
                  draggedEveryday.current = category;
                  everydayDragOrder.current = everydayOrder;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!draggedEveryday.current) return;
                  const target = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>("[data-everyday-category]")
                    ?.dataset.everydayCategory;
                  if (target) moveEverydayDragged(target);
                }}
                onPointerUp={() => {
                  if (draggedEveryday.current)
                    save(
                      {
                        ...data,
                        everydayCategoryOrder: everydayDragOrder.current,
                      },
                      "порядок повседневных категорий сохранён",
                    );
                  draggedEveryday.current = undefined;
                }}
              >
                ≡
              </button>
              <span>{category}</span>
              <span className="expense-trailing">
                  {money(setting?.limit ?? 0)}{" "}
                  <button
                    className="icon"
                    aria-label={`изменить лимит для категории ${category}`}
                    onClick={() => setLimitCategory(category)}
                  >
                    ✎
                  </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="card category-list settings-card">
        <h2>категории</h2>
        {order.map((category) => (
          <div
            className="row category-row"
            key={category}
            data-category={category}
          >
            <button
              className="drag-handle"
              aria-label={`переместить категорию ${category}`}
              onPointerDown={(event) => {
                dragged.current = category;
                dragOrder.current = order;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!dragged.current) return;
                const target = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-category]")?.dataset.category;
                if (target) moveDragged(target);
              }}
              onPointerUp={() => {
                if (dragged.current)
                  save(
                    { ...data, categories: dragOrder.current },
                    "порядок категорий сохранён",
                  );
                dragged.current = undefined;
              }}
            >
              ≡
            </button>
            <span>
              {category}
              <small>
                {(data.categoryTypes[category] ?? [])
                  .map((type) => typeLabels[type])
                  .join(" · ")}
              </small>
            </span>
            <span>
              <button
                className="icon"
                aria-label={`изменить категорию ${category}`}
                onClick={() => beginEdit(category)}
              >
                ✎
              </button>
              <button
                className="icon"
                aria-label={`удалить категорию ${category}`}
                onClick={() => {
                  const hasLimit = data.everydayLimits.some(
                    (item) => item.category === category && item.limit > 0,
                  );
                  const hasCurrentExpense = data.periods
                    .find((period) => period.current)
                    ?.everyday.some(
                      (item) =>
                        item.category === category && item.expenses.length > 0,
                    );
                  if (hasLimit || hasCurrentExpense) {
                    save(
                      data,
                      "нельзя удалить категорию, пока у неё есть активный лимит",
                    );
                    return;
                  }
                  setDeleting(category);
                }}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
      <button className="secondary" onClick={() => setAdding(true)}>
        добавить категорию
      </button>
      {editing && (
        <Modal title={editing} onClose={() => setEditing(undefined)}>
          <form className="form" onSubmit={saveCategory}>
            <Field label="название">
              <input
                autoFocus
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </Field>
            <fieldset className="type-options">
              <legend>тип расхода</legend>
              {expenseTypeOptions.map(([value, label]) => (
                <ExpenseTypeCheckbox
                  key={value}
                  value={value}
                  label={label}
                  checked={editTypes.includes(value)}
                  onChange={(checked) =>
                    setEditTypes(
                      checked
                        ? [...editTypes, value]
                        : editTypes.filter((type) => type !== value),
                    )
                  }
                />
              ))}
            </fieldset>
            {editError && <p className="error">{editError}</p>}
            <ModalActions close={() => setEditing(undefined)} />
          </form>
        </Modal>
      )}
      {adding && (
        <Modal title="добавить категорию" onClose={() => setAdding(false)}>
          <form className="category-form" onSubmit={addCategory}>
            <input name="category" placeholder="название категории" required />
            <TypeOptions />
            {addError && <p className="error">{addError}</p>}
            <div className="actions-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setAdding(false)}
              >
                отмена
              </button>
              <button className="primary">добавить</button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="удалить категорию?"
          onClose={() => setDeleting(undefined)}
        >
          <p className="modal-copy">ранее внесённые расходы сохранятся</p>
          <div className="actions-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setDeleting(undefined)}
            >
              отмена
            </button>
            <button
              className="danger-action"
              onClick={() => {
                save(
                  {
                    ...data,
                    categories: data.categories.filter(
                      (item) => item !== deleting,
                    ),
                    everydayCategoryOrder: (
                      data.everydayCategoryOrder ?? categoriesFor(data, "everyday")
                    ).filter((item) => item !== deleting),
                    categoryTypes: Object.fromEntries(
                      Object.entries(data.categoryTypes).filter(
                        ([name]) => name !== deleting,
                      ),
                    ),
                    drafts: data.drafts.filter(
                      (draft) => draft.category !== deleting,
                    ),
                    everydayLimits: data.everydayLimits.filter(
                      (limit) => limit.category !== deleting,
                    ),
                  },
                  "категория удалена",
                );
                setDeleting(undefined);
              }}
            >
              удалить
            </button>
          </div>
        </Modal>
      )}
      {limitCategory && (
        <AmountModal
          title={limitCategory}
          requireExplicitValue
          initial={
            data.everydayLimits.find(
              (limit) => limit.category === limitCategory,
            )?.limit ?? 0
          }
          close={() => setLimitCategory(undefined)}
          save={(limit) => {
            const existing = data.everydayLimits.find(
              (item) => item.category === limitCategory,
            );
            const currentItem = data.periods
              .find((period) => period.current)
              ?.everyday.find((item) => item.category === limitCategory);
            const currentSpent = currentItem ? spent(currentItem) : 0;
            const nextSetting =
              limit === 0 && currentSpent > 0
                ? {
                    id: existing?.id ?? uid(),
                    category: limitCategory,
                    limit: currentSpent,
                    automatic: true,
                  }
                : limit > 0
                  ? {
                      id: existing?.id ?? uid(),
                      category: limitCategory,
                      limit,
                      automatic: false,
                    }
                  : undefined;
            const everydayLimits = nextSetting
              ? existing
                ? data.everydayLimits.map((item) =>
                    item.id === existing.id ? nextSetting : item,
                  )
                : [...data.everydayLimits, nextSetting]
              : data.everydayLimits.filter(
                  (item) => item.category !== limitCategory,
                );
            save(
              {
                ...data,
                everydayLimits,
                periods: data.periods.map((period) => {
                  if (!period.current) return period;
                  const current = period.everyday.find(
                    (item) => item.category === limitCategory,
                  );
                  if (current && limit === 0 && spent(current) === 0)
                    return {
                      ...period,
                      everyday: period.everyday.filter(
                        (item) => item.id !== current.id,
                      ),
                    };
                  if (current)
                    return {
                      ...period,
                      everyday: period.everyday.map((item) =>
                        item.id === current.id
                          ? limit === 0
                            ? {
                                ...item,
                                limit: spent(item),
                                automatic: true,
                              }
                            : { ...item, limit, automatic: false }
                          : item,
                      ),
                    };
                  if (limit === 0) return period;
                  return {
                    ...period,
                    everyday: [
                      ...period.everyday,
                      {
                        id: uid(),
                        category: limitCategory,
                        limit,
                        automatic: false,
                        expenses: [],
                      },
                    ],
                  };
                }),
              },
              "повседневный лимит сохранён",
            );
            setLimitCategory(undefined);
          }}
        />
      )}
      {draftCategory && (
        <AmountModal
          title={draftCategory}
          initial={
            data.drafts.find((draft) => draft.category === draftCategory)
              ?.amount ?? 0
          }
          close={() => setDraftCategory(undefined)}
          save={(amount) => {
            const existing = data.drafts.find(
              (draft) => draft.category === draftCategory,
            );
            save(
              {
                ...data,
                drafts:
                  amount === 0
                    ? data.drafts.filter(
                        (draft) => draft.category !== draftCategory,
                      )
                    : existing
                      ? data.drafts.map((draft) =>
                          draft.id === existing.id
                            ? { ...draft, amount }
                            : draft,
                        )
                      : [
                          ...data.drafts,
                          { id: uid(), category: draftCategory, amount },
                        ],
              },
              "сумма запланированного расхода сохранена",
            );
            setDraftCategory(undefined);
          }}
        />
      )}
    </section>
  );
}

function HistoricalExpenseGroup({
  title,
  expenses,
  total,
}: {
  title: string;
  expenses: Expense[];
  total: number;
}) {
  return (
    <section className="card history-expense-group">
      <h2>{title}</h2>
      {expenses.length ? (
        expenses.map((expense) => (
          <div className="row" key={expense.id}>
            <span>
              {expense.category}
              {expense.name && <small>{expense.name}</small>}
            </span>
            <span>{money(expense.amount)}</span>
          </div>
        ))
      ) : (
        <p className="muted">расходов не было</p>
      )}
      <p className="group-total">всего {money(total)}</p>
    </section>
  );
}

export function History({
  periods,
  everydayOrder,
  back,
}: {
  periods: Period[];
  everydayOrder: string[];
  back: () => void;
}) {
  const [open, setOpen] = useState<Period>();
  if (open) {
    const totals = actualExpenseTotals(open);
    const categoryPosition = (category: string) => {
      const position = everydayOrder.indexOf(category);
      return position < 0 ? Number.MAX_SAFE_INTEGER : position;
    };
    const everyday = [...open.everyday]
      .filter((item) => spent(item) > 0)
      .sort(
        (left, right) =>
          categoryPosition(left.category) - categoryPosition(right.category),
      );
    return (
      <section>
        <Top title="история периода" back={() => setOpen(undefined)} />
        <div className="card summary">
          <p>
            {dateLabel(open.startDate)} — {dateLabel(open.nextSalaryDate)}
          </p>
          <h2>остаток: {money(freeMoney(open))}</h2>
        </div>
        <div className="groups history-groups">
          <HistoricalExpenseGroup
            title="запланированные расходы"
            expenses={sortPlannedExpenses(open.mandatory)}
            total={totals.mandatory}
          />
          <section className="card history-expense-group">
            <h2>повседневные расходы</h2>
            {everyday.length ? (
              everyday.map((item) => (
                <div className="row" key={item.id}>
                  <span>{item.category}</span>
                  <span>{money(spent(item))}</span>
                </div>
              ))
            ) : (
              <p className="muted">расходов не было</p>
            )}
            <p className="group-total">всего {money(totals.everyday)}</p>
          </section>
          <HistoricalExpenseGroup
            title="внеплановые расходы"
            expenses={open.oneOff}
            total={totals.oneOff}
          />
          <HistoricalExpenseGroup
            title="импульсивные покупки"
            expenses={open.impulse}
            total={totals.impulse}
          />
        </div>
        <PeriodTotals period={open} today={open.nextSalaryDate} />
      </section>
    );
  }
  return (
    <section>
      <Top title="история периодов" back={back} />
      {periods.length === 0 ? (
        <div className="empty">
          <p>завершённые периоды появятся здесь</p>
        </div>
      ) : (
        <div className="menu">
          {periods.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)}>
              {dateLabel(p.startDate)} — {dateLabel(p.nextSalaryDate)}
              <span>›</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
export function Backup({
  data,
  save,
  restore,
  back,
}: {
  data: AppData;
  save: (d: AppData, message?: string) => void;
  restore: (d: AppData) => void;
  back: () => void;
}) {
  const [error, setError] = useState("");
  const [pendingRestore, setPendingRestore] = useState<AppData>();
  const download = () => {
    const lastBackupDate = todayIso();
    const backup = { ...data, lastBackupDate };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      }),
    );
    a.download = `cushion-${lastBackupDate}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    save(backup, "резервная копия создана");
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!validBackup(d)) throw Error();
      setPendingRestore(normalizeData(d));
    } catch {
      setError("файл не является корректной резервной копией cushion");
    }
  };
  return (
    <section>
      <Top title="резервная копия" back={back} />
      <div className="card">
        <h2>сохранить данные</h2>
        <p className="muted">
          создайте файл со всеми периодами, категориями, расходами и вишлистом
        </p>
        <button className="secondary" onClick={download}>
          создать резервную копию
        </button>
        <p className="muted">
          {data.lastBackupDate
            ? `последняя резервная копия: ${backupDateLabel(data.lastBackupDate)}`
            : "резервная копия ещё не создавалась"}
        </p>
      </div>
      <div className="card">
        <h2>восстановить данные</h2>
        <p className="muted">текущие локальные данные будут заменены</p>
        <label className="secondary file">
          восстановить резервную копию
          <input type="file" accept="application/json" onChange={upload} />
        </label>
        {error && <p className="error">{error}</p>}
      </div>
      {pendingRestore && (
        <Modal
          title="восстановить резервную копию?"
          onClose={() => setPendingRestore(undefined)}
        >
          <p className="modal-copy">
            текущие локальные данные будут полностью заменены
          </p>
          <div className="actions-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setPendingRestore(undefined)}
            >
              отмена
            </button>
            <button
              className="danger-action"
              onClick={() => {
                restore(pendingRestore);
                setPendingRestore(undefined);
              }}
            >
              восстановить
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
export function ExpenseTypeCheckbox({
  value,
  label,
  checked,
  onChange,
}: {
  value: ExpenseKind;
  label: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="type-option">
      <input
        type="checkbox"
        name="type"
        value={value}
        checked={checked}
        onChange={
          onChange ? (event) => onChange(event.target.checked) : undefined
        }
      />
      <span>{label}</span>
    </label>
  );
}

export function TypeOptions() {
  return (
    <fieldset className="type-options">
      <legend>тип расхода</legend>
      {expenseTypeOptions.map(([value, label]) => (
        <ExpenseTypeCheckbox key={value} value={value} label={label} />
      ))}
    </fieldset>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function ModalActions({ close }: { close: () => void }) {
  return (
    <div className="actions-row">
      <button type="button" className="secondary" onClick={close}>
        отмена
      </button>
      <button className="primary">сохранить</button>
    </div>
  );
}

function ExpenseEditModal({
  expense,
  group,
  periodEnd,
  close,
  save,
}: {
  expense: Expense;
  group: "mandatory" | "oneOff" | "impulse";
  periodEnd: string;
  close: () => void;
  save: (name: string | undefined, amount: number, date?: string) => void;
}) {
  const [name, setName] = useState(expense.name ?? "");
  const [amount, setAmount] = useState(
    formatInputAmount(String(expense.amount)),
  );
  const [plannedDate, setPlannedDate] = useState(
    expense.date ? toRuDate(expense.date) : "",
  );
  const [error, setError] = useState("");
  const hasName = true;
  const nameRequired = group === "oneOff" || group === "impulse";
  const canEditDate = group === "mandatory" && expense.status === "предстоит";
  return (
    <Modal title={expense.name || expense.category} onClose={close}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedName = name.trim().toLowerCase();
          const parsedAmount = num(amount);
          if (nameRequired && !trimmedName) return setError("введите название");
          if (!validateAmount(parsedAmount) || parsedAmount === 0)
            return setError("сумма расхода должна быть больше нуля");
          const date = canEditDate
            ? plannedDate
              ? fromRuDate(plannedDate)
              : undefined
            : expense.date;
          if (canEditDate && !plannedDate) return setError("укажите дату");
          if (canEditDate && !date)
            return setError("введите существующую дату");
          if (canEditDate && date && (date < todayIso() || date > periodEnd))
            return setError(
              "дата должна быть не раньше сегодня и не позже конца периода",
            );
          save(trimmedName || undefined, parsedAmount, date);
        }}
      >
        {hasName && (
          <Field label={nameRequired ? "название" : "название (необязательно)"}>
            <input
              autoFocus
              required={nameRequired}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        )}
        <Field label="сумма">
          <input
            autoFocus={!hasName}
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(event) =>
              setAmount(formatInputAmount(event.target.value))
            }
          />
        </Field>
        {canEditDate && (
          <Field label="дата">
            <DateInput value={plannedDate} onChange={setPlannedDate} required />
          </Field>
        )}
        {error && <p className="error">{error}</p>}
        <ModalActions close={close} />
      </form>
    </Modal>
  );
}

function AmountModal({
  title,
  initial,
  requireExplicitValue = false,
  requirePositive = false,
  close,
  save,
}: {
  title: string;
  initial: number;
  requireExplicitValue?: boolean;
  requirePositive?: boolean;
  close: () => void;
  save: (amount: number) => void;
}) {
  const [value, setValue] = useState(
    initial === 0 ? "" : formatInputAmount(String(initial)),
  );
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={close}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (requireExplicitValue && value.trim() === "")
            return setError("введите сумму");
          const amount = num(value);
          if (!validateAmount(amount)) return setError("проверьте сумму");
          if (requirePositive && amount === 0)
            return setError("сумма расхода должна быть больше нуля");
          save(amount);
        }}
      >
        <input
          autoFocus
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(event) => setValue(formatInputAmount(event.target.value))}
        />
        {error && <p className="error">{error}</p>}
        <ModalActions close={close} />
      </form>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small aria-hidden="true">{hint}</small>}
    </label>
  );
}
function Top({ title, back }: { title: string; back: () => void }) {
  return (
    <div className="top">
      <button onClick={back}>‹</button>
      <h1>{title}</h1>
    </div>
  );
}
