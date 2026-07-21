import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  | "drafts"
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
    ) : page === "drafts" ? (
      <Drafts data={data} save={update} back={() => setPage("more")} />
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
      {!["create", "add", "categories", "drafts", "history", "backup"].includes(
        page,
      ) && (
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
        <p>
          {dateLabel(period.startDate)} — {dateLabel(period.nextSalaryDate)} ·{" "}
          {daysUntil(period.nextSalaryDate)} дн. до зарплаты
        </p>
        <span>свободные деньги</span>
        <h1>{money(freeMoney(period))}</h1>
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
}: {
  p: Period;
  editable?: boolean;
  onChange?: (p: Period) => void;
}) {
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
  const editAmount = (value: number, apply: (n: number) => void) => {
    const v = prompt("новая сумма", String(value));
    if (v === null) return;
    const n = Number(v);
    if (validateAmount(n)) apply(n);
  };
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
                editAmount(e.amount, (n) =>
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
  return (
    <div className="groups">
      <Group
        title="обязательные расходы"
        empty="обязательных расходов пока нет"
      >
        {p.mandatory.map((e) => row(e, "mandatory"))}
      </Group>
      <Group title="повседневные расходы" empty="повседневные лимиты не заданы">
        {p.everyday.map((e) => (
          <div className="row" key={e.id}>
            <span>
              {e.category}
              <small>
                потрачено {formatAmount(spent(e))} ₽ · запланировано{" "}
                {formatAmount(stillPlanned(e))} ₽
              </small>
            </span>
            <span>
              {money(e.limit)}{" "}
              {editable && (
                <>
                  <button
                    className="icon"
                    aria-label="изменить"
                    onClick={() =>
                      editAmount(e.limit, (n) =>
                        onChange?.({
                          ...p,
                          everyday: p.everyday.map((x) =>
                            x.id === e.id ? { ...x, limit: n } : x,
                          ),
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
                        everyday: p.everyday.filter((x) => x.id !== e.id),
                      })
                    }
                  >
                    ×
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </Group>
      <Group title="разовые расходы" empty="разовые расходы не запланированы">
        {p.oneOff.map((e) => row(e, "oneOff"))}
      </Group>
      <Group
        title="импульсивные покупки"
        empty="импульсивные покупки не добавлены"
      >
        {p.impulse.map((e) => row(e))}
      </Group>
    </div>
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
  const draftExpenses = useMemo(() => {
    const combined = [
      ...data.drafts.map((d) => ({
        id: d.id,
        category: d.category,
        amount: d.amount,
        status: "предстоит" as Status,
      })),
      ...(last?.mandatory ?? []).map((e) => ({
        ...e,
        id: `last-${e.id}`,
        status: "предстоит" as Status,
      })),
    ];
    return combined.filter(
      (item, index) =>
        combined.findIndex((other) => other.category === item.category) ===
        index,
    );
  }, [data.drafts, last]);
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
        <Picker
          title="обязательные расходы"
          hint="выберите нужные платежи и проверьте суммы"
          items={draftExpenses}
          selected={mandatory}
          setSelected={setMandatory}
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
function Picker({
  title,
  hint,
  items,
  selected,
  setSelected,
}: {
  title: string;
  hint: string;
  items: Expense[];
  selected: Expense[];
  setSelected: (x: Expense[]) => void;
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      {items.length === 0 && <p>черновиков пока нет, продолжите без них</p>}
      {items.map((x) => {
        const s = selected.find((y) => y.category === x.category);
        return (
          <label className="pick" key={x.id}>
            <input
              type="checkbox"
              checked={!!s}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, { ...x, id: uid() }]
                    : selected.filter((y) => y.category !== x.category),
                )
              }
            />
            <span>{x.category}</span>
            <input
              className="mini"
              inputMode="decimal"
              value={formatInputAmount(String(s?.amount ?? x.amount))}
              disabled={!s}
              onChange={(e) =>
                setSelected(
                  selected.map((y) =>
                    y.category === x.category
                      ? { ...y, amount: num(e.target.value) }
                      : y,
                  ),
                )
              }
            />
          </label>
        );
      })}
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
}: {
  title: string;
  items: Expense[];
  setItems: (x: Expense[]) => void;
  categories: string[];
  amountLabel?: string;
  optional?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const add = (e: FormEvent) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement),
      amount = num(f.get("amount"));
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
        <select name="category" required defaultValue="">
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
          placeholder={amountLabel}
          onInput={formatAmountField}
          required
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
  const [type, setType] = useState("mandatory");
  const [error, setError] = useState("");
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      amount = num(f.get("amount"));
    if (!validateAmount(amount)) {
      setError("сумма должна быть числом и не может быть отрицательной");
      return;
    }
    const category = String(f.get("category"));
    let p = period;
    if (type === "everyday") {
      const target = p.everyday.find((x) => x.category === category);
      if (!target) return setError("сначала добавьте лимит для этой категории");
      p = {
        ...p,
        everyday: p.everyday.map((x) =>
          x.id === target.id
            ? { ...x, expenses: [...x.expenses, { id: uid(), amount }] }
            : x,
        ),
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
      ? period.everyday.map((x) => x.category)
      : categoriesFor(data, type as ExpenseKind);
  return (
    <section>
      <Top title="добавить расход" back={done} />
      <form className="card form" onSubmit={submit}>
        <Field label="тип расхода">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="mandatory">обязательные расходы</option>
            <option value="everyday">повседневные расходы</option>
            <option value="oneOff">разовые расходы</option>
            <option value="impulse">импульсивные покупки</option>
          </select>
        </Field>
        <Field label="категория">
          <select name="category" required defaultValue="">
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
            placeholder="0"
            onInput={formatAmountField}
            required
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
      <Groups p={period} editable onChange={change} />
      <button className="secondary" onClick={() => go("add")}>
        добавить расход
      </button>
      <button className="primary" onClick={() => go("create")}>
        создать следующий период
      </button>
    </>
  );
}
function More({ go }: { go: (p: Page) => void }) {
  return (
    <section>
      <div className="menu">
        {[
          ["categories", "категории"],
          ["drafts", "черновики обязательных расходов"],
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
function Categories({
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
