import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  categoriesFor,
  daysUntil,
  formatAmount,
  freeMoney,
  normalizeData,
  spent,
  stillPlanned,
  uid,
  validBackup,
  type AppData,
  type EverydayLimit,
  type Expense,
  type ExpenseKind,
  type Period,
  type Status,
} from "./domain";
import { IndexedDbStorage } from "./storage";
type Page =
  | "home"
  | "period"
  | "more"
  | "add"
  | "create"
  | "categories"
  | "history"
  | "backup";
const storage = new IndexedDbStorage();
const money = (n: number) => <>{formatAmount(n)} ₽</>;
const dateLabel = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
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
const toRuDate = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}.${month}.${year}` : "";
};
const fromRuDate = (value: string) => {
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

export function App() {
  const [data, setData] = useState<AppData>();
  const [page, setPage] = useState<Page>("home");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    storage.load().then(setData);
  }, []);
  const update = (next: AppData, msg = "") => {
    setData(next);
    storage.save(next);
    if (msg) {
      setNotice(msg);
      setTimeout(() => setNotice(""), 2500);
    }
  };
  if (!data) return <main className="center">загрузка…</main>;
  const current = data.periods.find((p) => p.current);
  const body =
    page === "create" ? (
      <CreatePeriod
        data={data}
        onSave={(p) => {
          update(
            {
              ...data,
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
    ) : page === "add" && current ? (
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
    ) : page === "history" ? (
      <History
        periods={data.periods.filter((p) => !p.current)}
        back={() => setPage("more")}
      />
    ) : page === "backup" ? (
      <Backup
        data={data}
        restore={(d) => {
          update(d, "резервная копия восстановлена");
          setPage("more");
        }}
        back={() => setPage("more")}
      />
    ) : (
      <Home period={current} go={setPage} />
    );
  return (
    <div className="app">
      <header>
        <span className="brand">cushion</span>
      </header>
      {notice && <div className="notice">{notice}</div>}
      <main>{body}</main>
      {!["create", "add", "categories", "history", "backup"].includes(page) && (
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
            className={page === "more" ? "active" : ""}
            onClick={() => setPage("more")}
          >
            ещё
          </button>
        </nav>
      )}
    </div>
  );
}

function Home({ period, go }: { period?: Period; go: (p: Page) => void }) {
  if (!period)
    return (
      <section className="empty hero">
        <h1>пока нет финансового периода</h1>
        <p>
          создайте период, чтобы начать планировать расходы до следующей
          зарплаты
        </p>
        <button className="primary" onClick={() => go("create")}>
          создать период
        </button>
      </section>
    );
  return (
    <>
      <section className="hero">
        <img
          className="hero-mascot"
          src={`${import.meta.env.BASE_URL}mascot.svg`}
          alt=""
          aria-hidden="true"
        />
        <p className="period-meta">
          <span>
            {dateLabel(period.startDate)} — {dateLabel(period.nextSalaryDate)}
          </span>
          <span>{daysUntil(period.nextSalaryDate)} дней до зарплаты</span>
        </p>
        <h1>{money(freeMoney(period))}</h1>
        <span className="money-label">свободные деньги</span>
      </section>
      <Groups p={period} />
      <button className="primary floating" onClick={() => go("add")}>
        добавить расход
      </button>
    </>
  );
}
function Groups({
  p,
  editable,
  onChange,
  everydayCategories,
}: {
  p: Period;
  editable?: boolean;
  onChange?: (p: Period) => void;
  everydayCategories?: string[];
}) {
  const [amountEdit, setAmountEdit] = useState<{
    title: string;
    value: number;
    apply: (amount: number) => void;
  }>();
  const status = (group: "mandatory" | "oneOff", e: Expense) => (
    <button
      className="status"
      onClick={() =>
        editable &&
        onChange?.({
          ...p,
          [group]: p[group].map((x) =>
            x.id === e.id
              ? {
                  ...x,
                  status: x.status === "оплачено" ? "предстоит" : "оплачено",
                }
              : x,
          ),
        })
      }
    >
      {e.status}
    </button>
  );
  const editAmount = (
    title: string,
    value: number,
    apply: (n: number) => void,
  ) => setAmountEdit({ title, value, apply });
  const row = (e: Expense, group?: "mandatory" | "oneOff") => (
    <div className="row" key={e.id}>
      <span>
        {e.category}
        {e.date && <small>{dateLabel(e.date)}</small>}
      </span>
      <span>
        {group && status(group, e)} {money(e.amount)}{" "}
        {editable && (
          <>
            <button
              className="icon"
              aria-label="изменить"
              onClick={() =>
                editAmount(`изменить: ${e.category}`, e.amount, (n) =>
                  onChange?.({
                    ...p,
                    [group ?? "impulse"]: (
                      p[group ?? "impulse"] as Expense[]
                    ).map((x) => (x.id === e.id ? { ...x, amount: n } : x)),
                  }),
                )
              }
            >
              ✎
            </button>
            <button
              className="icon"
              aria-label="удалить"
              onClick={() =>
                onChange?.({
                  ...p,
                  [group ?? "impulse"]: (
                    p[group ?? "impulse"] as Expense[]
                  ).filter((x) => x.id !== e.id),
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
  const everydayItems =
    editable && everydayCategories
      ? everydayCategories.map(
          (category) =>
            p.everyday.find((item) => item.category === category) ?? {
              id: `empty-${category}`,
              category,
              limit: 0,
              expenses: [],
            },
        )
      : p.everyday;
  return (
    <>
      <div className="groups">
        <Group
          title="обязательные расходы"
          empty="обязательных расходов пока нет"
        >
          {p.mandatory.map((e) => row(e, "mandatory"))}
        </Group>
        <section className="card">
          <h2>повседневные расходы</h2>
          {everydayItems.length === 0 && (
            <p className="muted">повседневные лимиты не заданы</p>
          )}
          {everydayItems.map((e) => {
            const usage = e.limit > 0 ? (spent(e) / e.limit) * 100 : 0;
            const progressTone =
              usage >= 90 ? "danger" : usage >= 50 ? "warning" : "safe";
            const remaining = stillPlanned(e);
            return (
            <div className={`row everyday-row${editable ? " editable" : ""}`} key={e.id}>
              <span>
                {e.category}
                {!editable && (
                  <small className="everyday-details">
                    <span>потрачено {formatAmount(spent(e))} ₽</span>
                    <span>запланировано {formatAmount(e.limit)} ₽</span>
                  </small>
                )}
              </span>
              <span className={!editable && remaining < 0 ? "negative" : ""}>
                {money(editable ? e.limit : remaining)}{" "}
                {editable && (
                  <>
                    <button
                      className="icon"
                      aria-label="изменить"
                      onClick={() =>
                        editAmount(`изменить: ${e.category}`, e.limit, (n) =>
                          onChange?.(
                            p.everyday.some(
                              (item) => item.category === e.category,
                            )
                              ? {
                                  ...p,
                                  everyday: p.everyday.map((x) =>
                                    x.category === e.category
                                      ? { ...x, limit: n }
                                      : x,
                                  ),
                                }
                              : {
                                  ...p,
                                  everyday: [
                                    ...p.everyday,
                                    {
                                      id: uid(),
                                      category: e.category,
                                      limit: n,
                                      expenses: [],
                                    },
                                  ],
                                },
                          ),
                        )
                      }
                    >
                      ✎
                    </button>
                  </>
                )}
              </span>
              {!editable && (
                <span className="category-progress" aria-hidden="true">
                  <i
                    className={progressTone}
                    style={{ width: `${Math.min(Math.max(usage, 0), 100)}%` }}
                  />
                </span>
              )}
            </div>
            );
          })}
        </section>
        <Group title="разовые расходы" empty="разовых расходов не было">
          {p.oneOff.map((e) => row(e, "oneOff"))}
        </Group>
        <Group
          title="импульсивные покупки"
          empty="импульсивных покупок не было"
        >
          {p.impulse.map((e) => row(e))}
        </Group>
      </div>
      {amountEdit && (
        <AmountModal
          title={amountEdit.title}
          initial={amountEdit.value}
          close={() => setAmountEdit(undefined)}
          save={(amount) => {
            amountEdit.apply(amount);
            setAmountEdit(undefined);
          }}
        />
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

function CreatePeriod({
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
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [base, setBase] = useState({
    startDate: toRuDate(new Date().toISOString().slice(0, 10)),
    nextSalaryDate: "",
    income: "",
    previousBalance: "0",
  });
  const [mandatory, setMandatory] = useState<Expense[]>([]);
  const [everyday, setEveryday] = useState<EverydayLimit[]>(
    last?.everyday.map((x) => ({ ...x, id: uid(), expenses: [] })) ?? [],
  );
  const [oneOff, setOneOff] = useState<Expense[]>([]);
  const next = () => {
    if (step === 1) {
      const inc = num(base.income),
        bal = num(base.previousBalance),
        startDate = fromRuDate(base.startDate),
        nextSalaryDate = fromRuDate(base.nextSalaryDate);
      if (!startDate || !nextSalaryDate || nextSalaryDate <= startDate)
        return setError(
          "введите даты в формате дд.мм.гггг; следующая зарплата должна быть позже даты начала",
        );
      if (!validateAmount(inc) || !validateAmount(bal, true))
        return setError("проверьте введённые суммы");
    }
    setError("");
    setStep((s) => s + 1);
  };
  const submit = () =>
    onSave({
      id: uid(),
      startDate: fromRuDate(base.startDate),
      nextSalaryDate: fromRuDate(base.nextSalaryDate),
      income: num(base.income),
      previousBalance: num(base.previousBalance),
      current: true,
      createdAt: new Date().toISOString(),
      mandatory,
      everyday,
      oneOff,
      impulse: [],
    });
  return (
    <section>
      <Top
        title="создание периода"
        back={step === 1 ? onCancel : () => setStep((s) => s - 1)}
      />
      <div className="progress">
        <i style={{ width: `${(step / 4) * 100}%` }} />
      </div>
      {step === 1 && (
        <div className="card form">
          <h2>основные данные</h2>
          <Field label="дата начала">
            <input
              inputMode="numeric"
              placeholder="дд.мм.гггг"
              value={base.startDate}
              onChange={(e) => setBase({ ...base, startDate: e.target.value })}
            />
          </Field>
          <Field label="дата следующей зарплаты">
            <input
              inputMode="numeric"
              placeholder="дд.мм.гггг"
              value={base.nextSalaryDate}
              onChange={(e) =>
                setBase({ ...base, nextSalaryDate: e.target.value })
              }
            />
          </Field>
          <Field label="доход">
            <input
              inputMode="decimal"
              value={base.income}
              placeholder="0"
              onChange={(e) =>
                setBase({ ...base, income: formatInputAmount(e.target.value) })
              }
            />
          </Field>
          <Field label="предыдущий остаток">
            <input
              inputMode="decimal"
              value={base.previousBalance}
              placeholder="0"
              onChange={(e) =>
                setBase({
                  ...base,
                  previousBalance: formatInputAmount(e.target.value),
                })
              }
            />
          </Field>
        </div>
      )}
      {step === 2 && (
        <ExpenseEditor
          title="обязательные расходы"
          items={mandatory}
          setItems={setMandatory}
          categories={categoriesFor(data, "mandatory")}
          drafts={data.drafts}
        />
      )}{" "}
      {step === 3 && (
        <LimitEditor
          items={everyday}
          setItems={setEveryday}
          categories={categoriesFor(data, "everyday")}
        />
      )}{" "}
      {step === 4 && (
        <ExpenseEditor
          title="разовые расходы"
          items={oneOff}
          setItems={setOneOff}
          categories={categoriesFor(data, "oneOff")}
          optional
        />
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={step === 4 ? submit : next}>
        {step === 4 ? "создать период" : "продолжить"}
      </button>
    </section>
  );
}
function LimitEditor({
  items,
  setItems,
  categories,
}: {
  items: EverydayLimit[];
  setItems: (x: EverydayLimit[]) => void;
  categories: string[];
}) {
  return (
    <ExpenseEditor
      title="повседневные расходы"
      items={items.map((x) => ({
        id: x.id,
        category: x.category,
        amount: x.limit,
      }))}
      setItems={(xs) =>
        setItems(
          xs.map((x) => ({
            id: x.id,
            category: x.category,
            limit: x.amount,
            expenses: items.find((i) => i.id === x.id)?.expenses ?? [],
          })),
        )
      }
      categories={categories}
      amountLabel="лимит"
    />
  );
}

function ExpenseEditor({
  title,
  items,
  setItems,
  categories,
  amountLabel = "сумма",
  optional,
  drafts = [],
}: {
  title: string;
  items: Expense[];
  setItems: (x: Expense[]) => void;
  categories: string[];
  amountLabel?: string;
  optional?: boolean;
  drafts?: { category: string; amount: number }[];
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [category, setCategory] = useState("");
  const draftAmount = drafts.find(
    (draft) => draft.category === category,
  )?.amount;
  const add = (e: FormEvent) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const rawAmount = String(f.get("amount") ?? "").trim();
    const amount = rawAmount ? num(rawAmount) : draftAmount;
    if (amount === undefined) return;
    if (!validateAmount(amount)) return;
    setItems([
      ...items,
      {
        id: uid(),
        category: String(f.get("category")),
        amount,
        status: "предстоит",
        date: optional ? fromRuDate(String(f.get("date") || "")) : undefined,
      },
    ]);
    ref.current?.reset();
    setCategory("");
  };
  return (
    <section className="card">
      <h2>{title}</h2>
      {optional && <p className="muted">этот шаг можно пропустить</p>}
      {items.map((x) => (
        <div className="row" key={x.id}>
          <span>
            {x.category}
            {x.date && <small>{dateLabel(x.date)}</small>}
          </span>
          <span>
            {money(x.amount)}{" "}
            <button
              className="icon"
              onClick={() => setItems(items.filter((i) => i.id !== x.id))}
            >
              ×
            </button>
          </span>
        </div>
      ))}
      <form ref={ref} onSubmit={add} className="inline">
        <select
          name="category"
          required
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="" disabled>
            категория
          </option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          name="amount"
          inputMode="decimal"
          min="0"
          placeholder={
            draftAmount === undefined
              ? amountLabel
              : formatInputAmount(String(draftAmount))
          }
          onInput={formatAmountField}
        />
        {optional && (
          <input
            name="date"
            inputMode="numeric"
            placeholder="дд.мм.гггг"
            aria-label="дата, необязательно"
          />
        )}
        <button>добавить</button>
      </form>
    </section>
  );
}

function AddExpense({
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
    const category = String(f.get("category"));
    let p = period;
    if (type === "everyday") {
      const target = p.everyday.find((x) => x.category === category);
      p = {
        ...p,
        everyday: target
          ? p.everyday.map((x) =>
              x.id === target.id
                ? { ...x, expenses: [...x.expenses, { id: uid(), amount }] }
                : x,
            )
          : [
              ...p.everyday,
              {
                id: uid(),
                category,
                limit: 0,
                expenses: [{ id: uid(), amount }],
              },
            ],
      };
    } else {
      const e = {
        id: uid(),
        category,
        amount,
        status:
          type === "mandatory" || type === "oneOff"
            ? (String(f.get("status")) as Status)
            : undefined,
        date:
          type === "oneOff"
            ? fromRuDate(String(f.get("date") || ""))
            : undefined,
      };
      p = {
        ...p,
        [type]: [
          ...(p[type as "mandatory" | "oneOff" | "impulse"] as Expense[]),
          e,
        ],
      };
    }
    save(
      { ...data, periods: data.periods.map((x) => (x.id === p.id ? p : x)) },
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
            }}
          >
            <option value="mandatory">обязательные расходы</option>
            <option value="everyday">повседневные расходы</option>
            <option value="oneOff">разовые расходы</option>
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
        {(type === "mandatory" || type === "oneOff") && (
          <Field label="статус">
            <select name="status">
              <option>предстоит</option>
              <option>оплачено</option>
            </select>
          </Field>
        )}
        {type === "oneOff" && (
          <Field label="дата, необязательно">
            <input name="date" inputMode="numeric" placeholder="дд.мм.гггг" />
          </Field>
        )}
        {error && <p className="error">{error}</p>}
        <button className="primary">добавить расход</button>
      </form>
    </section>
  );
}

function LegacyPeriodScreen({
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
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [edit, setEdit] = useState({
    startDate: period ? toRuDate(period.startDate) : "",
    nextSalaryDate: period ? toRuDate(period.nextSalaryDate) : "",
    income: period ? formatInputAmount(String(period.income)) : "",
    previousBalance: period
      ? formatInputAmount(String(period.previousBalance))
      : "",
  });
  if (!period)
    return (
      <section className="empty">
        <h1>нет текущего периода</h1>
        <button className="primary" onClick={() => go("create")}>
          создать период
        </button>
      </section>
    );
  const change = (p: Period) =>
    save(
      { ...data, periods: data.periods.map((x) => (x.id === p.id ? p : x)) },
      "изменения сохранены",
    );
  const startEditing = () => {
    setEdit({
      startDate: toRuDate(period.startDate),
      nextSalaryDate: toRuDate(period.nextSalaryDate),
      income: formatInputAmount(String(period.income)),
      previousBalance: formatInputAmount(String(period.previousBalance)),
    });
    setEditError("");
    setEditing(true);
  };
  const savePeriod = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startDate = fromRuDate(edit.startDate);
    const nextSalaryDate = fromRuDate(edit.nextSalaryDate);
    const income = num(edit.income);
    const previousBalance = num(edit.previousBalance);
    if (!startDate || !nextSalaryDate || nextSalaryDate <= startDate) {
      setEditError(
        "введите даты в формате дд.мм.гггг; следующая зарплата должна быть позже даты начала",
      );
      return;
    }
    if (!validateAmount(income) || !validateAmount(previousBalance, true)) {
      setEditError("проверьте введённые суммы");
      return;
    }
    change({ ...period, startDate, nextSalaryDate, income, previousBalance });
    setEditing(false);
  };
  return (
    <>
      <section className="card summary">
        <h1>период</h1>
        {editing ? (
          <form className="form" onSubmit={savePeriod}>
            <Field label="дата начала">
              <input
                inputMode="numeric"
                placeholder="дд.мм.гггг"
                value={edit.startDate}
                onChange={(e) =>
                  setEdit({ ...edit, startDate: e.target.value })
                }
              />
            </Field>
            <Field label="дата следующей зарплаты">
              <input
                inputMode="numeric"
                placeholder="дд.мм.гггг"
                value={edit.nextSalaryDate}
                onChange={(e) =>
                  setEdit({ ...edit, nextSalaryDate: e.target.value })
                }
              />
            </Field>
            <Field label="доход">
              <input
                inputMode="decimal"
                value={edit.income}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    income: formatInputAmount(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="предыдущий остаток">
              <input
                inputMode="decimal"
                value={edit.previousBalance}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    previousBalance: formatInputAmount(e.target.value),
                  })
                }
              />
            </Field>
            {editError && <p className="error">{editError}</p>}
            <div className="actions-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(false)}
              >
                отменить
              </button>
              <button className="primary">сохранить</button>
            </div>
          </form>
        ) : (
          <>
            <p>
              {dateLabel(period.startDate)} — {dateLabel(period.nextSalaryDate)}
            </p>
            <div className="row">
              <span>доход</span>
              <b>{money(period.income)}</b>
            </div>
            <div className="row">
              <span>предыдущий остаток</span>
              <b>{money(period.previousBalance)}</b>
            </div>
            <button className="secondary" onClick={startEditing}>
              изменить период
            </button>
          </>
        )}
      </section>
      <section className="expense-settings">
        <h2 className="section-title">скорректировать расходы</h2>
        <Groups
          p={period}
          editable
          onChange={change}
          everydayCategories={categoriesFor(data, "everyday")}
        />
      </section>
      <div className="period-actions">
        <button
          className="secondary"
          onClick={() => {
            const value = prompt("сумма дохода", "");
            if (value === null) return;
            const amount = num(value);
            if (!validateAmount(amount) || amount === 0) return;
            change({ ...period, income: period.income + amount });
          }}
        >
          добавить доход
        </button>
        <button className="secondary" onClick={() => go("create")}>
          создать следующий период
        </button>
        <button
          className="secondary"
          onClick={() => {
            if (
              confirm(
                "очистить текущий период? даты, суммы, лимиты и расходы будут удалены",
              )
            ) {
              save(
                {
                  ...data,
                  periods: data.periods.filter((item) => item.id !== period.id),
                },
                "текущий период очищен",
              );
              go("home");
            }
          }}
        >
          очистить текущий период
        </button>
      </div>
    </>
  );
}
type PeriodField =
  "startDate" | "nextSalaryDate" | "income" | "previousBalance";

function PeriodScreen({
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
  if (!period)
    return (
      <section className="empty">
        <h1>нет текущего периода</h1>
        <button className="primary" onClick={() => go("create")}>
          создать период
        </button>
      </section>
    );
  const change = (p: Period) =>
    save(
      { ...data, periods: data.periods.map((x) => (x.id === p.id ? p : x)) },
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
    <div className="row" key={field}>
      <span>{fieldLabels[field]}</span>
      <span>
        {value}{" "}
        <button
          className="icon"
          aria-label={`изменить ${fieldLabels[field]}`}
          onClick={() => openEdit(field)}
        >
          ✎
        </button>
      </span>
    </div>
  );
  return (
    <>
      <section className="period-settings">
        <h2 className="section-title">изменить период</h2>
        <div className="card summary">
          {settingRow("startDate", toRuDate(period.startDate))}
          {settingRow("nextSalaryDate", toRuDate(period.nextSalaryDate))}
          {settingRow("income", money(period.income))}
          {settingRow("previousBalance", money(period.previousBalance))}
        </div>
      </section>
      <section className="expense-settings">
        <h2 className="section-title">скорректировать расходы</h2>
        <Groups
          p={period}
          editable
          onChange={change}
          everydayCategories={categoriesFor(data, "everyday")}
        />
      </section>
      <div className="period-actions">
        <button className="secondary" onClick={() => setAddingIncome(true)}>
          добавить доход
        </button>
        <button className="secondary" onClick={() => go("create")}>
          создать следующий период
        </button>
        <button
          className="secondary"
          onClick={() => {
            if (
              confirm(
                "очистить текущий период? даты, суммы, лимиты и расходы будут удалены",
              )
            ) {
              save(
                {
                  ...data,
                  periods: data.periods.filter((item) => item.id !== period.id),
                },
                "текущий период очищен",
              );
              go("home");
            }
          }}
        >
          очистить текущий период
        </button>
      </div>
      {editField && (
        <Modal
          title={`изменить: ${fieldLabels[editField]}`}
          onClose={() => setEditField(undefined)}
        >
          <form className="form" onSubmit={saveField}>
            <input
              autoFocus
              inputMode={
                editField === "startDate" || editField === "nextSalaryDate"
                  ? "numeric"
                  : "decimal"
              }
              value={editValue}
              onChange={(event) =>
                setEditValue(
                  editField === "startDate" || editField === "nextSalaryDate"
                    ? event.target.value
                    : formatInputAmount(event.target.value),
                )
              }
            />
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
    </>
  );
}

function More({ go }: { go: (p: Page) => void }) {
  return (
    <section>
      <div className="menu">
        {[
          ["categories", "категории и расходы"],
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
function LegacyCategories({
  data,
  save,
  back,
}: {
  data: AppData;
  save: (d: AppData, m?: string) => void;
  back: () => void;
}) {
  const [error, setError] = useState("");
  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = String(f.get("category")).trim().toLowerCase();
    const types = f.getAll("type") as ExpenseKind[];
    if (!types.length) return setError("выберите хотя бы один тип расхода");
    if (data.categories.includes(v))
      return setError("такая категория уже есть");
    setError("");
    save(
      {
        ...data,
        categories: [...data.categories, v],
        categoryTypes: { ...data.categoryTypes, [v]: types },
      },
      "категория добавлена",
    );
    e.currentTarget.reset();
  };
  const rename = (c: string) => {
    const v = prompt("новое название категории", c)?.trim().toLowerCase();
    if (v && !data.categories.includes(v))
      save(
        {
          ...data,
          categories: data.categories.map((x) => (x === c ? v : x)),
          categoryTypes: Object.fromEntries(
            Object.entries(data.categoryTypes).map(([name, types]) => [
              name === c ? v : name,
              types,
            ]),
          ),
        },
        "категория переименована",
      );
  };
  const typeLabels: Record<ExpenseKind, string> = {
    mandatory: "обязательные",
    everyday: "повседневные",
    oneOff: "разовые",
    impulse: "импульсивные",
  };
  return (
    <section>
      <Top title="категории" back={back} />
      <div className="card">
        {data.categories.map((c) => (
          <div className="row" key={c}>
            <span>
              {c}
              <small>
                {(data.categoryTypes[c] ?? [])
                  .map((type) => typeLabels[type])
                  .join(" · ")}
              </small>
            </span>
            <span>
              <button
                className="icon"
                aria-label="переименовать"
                onClick={() => rename(c)}
              >
                ✎
              </button>
              <button
                className="icon"
                aria-label="удалить"
                onClick={() =>
                  save(
                    {
                      ...data,
                      categories: data.categories.filter((x) => x !== c),
                      categoryTypes: Object.fromEntries(
                        Object.entries(data.categoryTypes).filter(
                          ([name]) => name !== c,
                        ),
                      ),
                    },
                    "категория удалена",
                  )
                }
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
      <form className="card category-form" onSubmit={add}>
        <input name="category" placeholder="название категории" required />
        <fieldset className="type-options">
          <legend>тип расхода</legend>
          {(
            [
              ["mandatory", "обязательные расходы"],
              ["everyday", "повседневные расходы"],
              ["oneOff", "разовые расходы"],
              ["impulse", "импульсивные покупки"],
            ] as [ExpenseKind, string][]
          ).map(([value, label]) => (
            <label className="type-option" key={value}>
              <input type="checkbox" name="type" value={value} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button className="secondary">добавить категорию</button>
      </form>
    </section>
  );
}
const expenseTypeOptions: [ExpenseKind, string][] = [
  ["mandatory", "обязательные расходы"],
  ["everyday", "повседневные расходы"],
  ["oneOff", "разовые расходы"],
  ["impulse", "импульсивные покупки"],
];

function Categories({
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
  const [editing, setEditing] = useState<string>();
  const [deleting, setDeleting] = useState<string>();
  const [editName, setEditName] = useState("");
  const [editTypes, setEditTypes] = useState<ExpenseKind[]>([]);
  const [editError, setEditError] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>();
  const [addError, setAddError] = useState("");
  useEffect(() => {
    setOrder(data.categories);
    dragOrder.current = data.categories;
  }, [data.categories]);
  const typeLabels: Record<ExpenseKind, string> = {
    mandatory: "обязательные",
    everyday: "повседневные",
    oneOff: "разовые",
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
    save(
      {
        ...data,
        categories: data.categories.map((category) =>
          category === editing ? name : category,
        ),
        categoryTypes: Object.fromEntries(
          Object.entries(data.categoryTypes)
            .filter(([category]) => category !== editing)
            .concat([[name, editTypes]]),
        ),
        drafts: data.drafts.map((draft) =>
          draft.category === editing ? { ...draft, category: name } : draft,
        ),
        periods: data.periods.map((period) => ({
          ...period,
          mandatory: period.mandatory.map(renameExpense),
          everyday: period.everyday.map((item) =>
            item.category === editing ? { ...item, category: name } : item,
          ),
          oneOff: period.oneOff.map(renameExpense),
          impulse: period.impulse.map(renameExpense),
        })),
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
        categoryTypes: { ...data.categoryTypes, [name]: types },
      },
      "категория добавлена",
    );
    setAddError("");
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
  const mandatoryCategories = categoriesFor(data, "mandatory");
  return (
    <section>
      <Top title="категории и расходы" back={back} />
      <h2 className="section-title">изменить категории</h2>
      <div className="card category-list">
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
                aria-label="изменить категорию"
                onClick={() => beginEdit(category)}
              >
                ✎
              </button>
              <button
                className="icon"
                aria-label="удалить категорию"
                onClick={() => setDeleting(category)}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
      <h2 className="section-title settings-subtitle">добавить категорию</h2>
      <form className="card category-form" onSubmit={addCategory}>
        <input name="category" placeholder="название категории" required />
        <TypeOptions />
        {addError && <p className="error">{addError}</p>}
        <button className="secondary">добавить категорию</button>
      </form>
      <h2 className="section-title settings-subtitle">
        настроить обязательные расходы
      </h2>
      <div className="card">
        {mandatoryCategories.map((category) => {
          const draft = data.drafts.find((item) => item.category === category);
          return (
            <div className="row" key={category}>
              <span>{category}</span>
              <span>
                {money(draft?.amount ?? 0)}{" "}
                <button
                  className="icon"
                  aria-label={`изменить сумму для категории ${category}`}
                  onClick={() => setDraftCategory(category)}
                >
                  ✎
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {editing && (
        <Modal title="изменить категорию" onClose={() => setEditing(undefined)}>
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
                <label className="type-option" key={value}>
                  <input
                    type="checkbox"
                    checked={editTypes.includes(value)}
                    onChange={(event) =>
                      setEditTypes(
                        event.target.checked
                          ? [...editTypes, value]
                          : editTypes.filter((type) => type !== value),
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            {editError && <p className="error">{editError}</p>}
            <ModalActions close={() => setEditing(undefined)} />
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="удалить категорию" onClose={() => setDeleting(undefined)}>
          <p>удалить категорию «{deleting}»?</p>
          <p className="muted">
            записанные расходы в текущем и прошлых периодах сохранятся
          </p>
          <div className="actions-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setDeleting(undefined)}
            >
              отмена
            </button>
            <button
              className="primary"
              onClick={() => {
                save(
                  {
                    ...data,
                    categories: data.categories.filter(
                      (item) => item !== deleting,
                    ),
                    categoryTypes: Object.fromEntries(
                      Object.entries(data.categoryTypes).filter(
                        ([name]) => name !== deleting,
                      ),
                    ),
                    drafts: data.drafts.filter(
                      (draft) => draft.category !== deleting,
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
      {draftCategory && (
        <AmountModal
          title={`изменить: ${draftCategory}`}
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
              "обязательный расход сохранён",
            );
            setDraftCategory(undefined);
          }}
        />
      )}
    </section>
  );
}

function Drafts({
  data,
  save,
  back,
}: {
  data: AppData;
  save: (d: AppData, m?: string) => void;
  back: () => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      amount = num(f.get("amount"));
    if (!validateAmount(amount)) return;
    save(
      {
        ...data,
        drafts: [
          ...data.drafts,
          { id: uid(), category: String(f.get("category")), amount },
        ],
      },
      "черновик добавлен",
    );
    e.currentTarget.reset();
  };
  const edit = (id: string) => {
    const draft = data.drafts.find((item) => item.id === id);
    if (!draft) return;
    const category = prompt("категория", draft.category);
    if (category === null || !data.categories.includes(category)) return;
    const value = prompt("новая сумма", String(draft.amount));
    if (value === null) return;
    const amount = Number(value);
    if (validateAmount(amount))
      save(
        {
          ...data,
          drafts: data.drafts.map((item) =>
            item.id === id ? { ...item, category, amount } : item,
          ),
        },
        "черновик изменён",
      );
  };
  return (
    <section>
      <Top title="черновики обязательных расходов" back={back} />
      <div className="card">
        {data.drafts.length === 0 && (
          <p className="muted">черновиков пока нет</p>
        )}
        {data.drafts.map((d) => (
          <div className="row" key={d.id}>
            <span>{d.category}</span>
            <span>
              {money(d.amount)}{" "}
              <button
                className="icon"
                aria-label="изменить"
                onClick={() => edit(d.id)}
              >
                ✎
              </button>
              <button
                className="icon"
                onClick={() =>
                  save(
                    {
                      ...data,
                      drafts: data.drafts.filter((x) => x.id !== d.id),
                    },
                    "черновик удалён",
                  )
                }
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
      <form className="inline" onSubmit={submit}>
        <select name="category" required defaultValue="">
          <option value="" disabled>
            категория
          </option>
          {categoriesFor(data, "mandatory").map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          name="amount"
          min="0"
          inputMode="decimal"
          placeholder="сумма"
          onInput={formatAmountField}
          required
        />
        <button>добавить</button>
      </form>
    </section>
  );
}
function History({ periods, back }: { periods: Period[]; back: () => void }) {
  const [open, setOpen] = useState<Period>();
  if (open)
    return (
      <section>
        <Top title="история периода" back={() => setOpen(undefined)} />
        <div className="card summary">
          <p>
            {dateLabel(open.startDate)} — {dateLabel(open.nextSalaryDate)}
          </p>
          <h2>итог: {money(freeMoney(open))}</h2>
        </div>
        <Groups p={open} />
      </section>
    );
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
function Backup({
  data,
  restore,
  back,
}: {
  data: AppData;
  restore: (d: AppData) => void;
  back: () => void;
}) {
  const [error, setError] = useState("");
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    a.download = `cushion-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!validBackup(d)) throw Error();
      if (confirm("текущие локальные данные будут заменены. продолжить?"))
        restore(normalizeData(d));
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
          создайте файл со всеми периодами, категориями и черновиками
        </p>
        <button className="secondary" onClick={download}>
          создать резервную копию
        </button>
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
    </section>
  );
}
function TypeOptions() {
  return (
    <fieldset className="type-options">
      <legend>тип расхода</legend>
      {expenseTypeOptions.map(([value, label]) => (
        <label className="type-option" key={value}>
          <input type="checkbox" name="type" value={value} />
          <span>{label}</span>
        </label>
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

function AmountModal({
  title,
  initial,
  close,
  save,
}: {
  title: string;
  initial: number;
  close: () => void;
  save: (amount: number) => void;
}) {
  const [value, setValue] = useState(formatInputAmount(String(initial)));
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={close}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const amount = num(value);
          if (!validateAmount(amount)) return setError("проверьте сумму");
          save(amount);
        }}
      >
        <input
          autoFocus
          inputMode="decimal"
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
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
