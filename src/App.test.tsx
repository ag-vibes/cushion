import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Categories,
  AddExpense,
  Backup,
  CreatePeriod,
  Home,
  PeriodScreen,
  Wishlist,
  formatDateInput,
  fromRuDate,
} from "./App";
import { emptyData, type AppData, type Period } from "./domain";

const makePeriod = (current: boolean): Period => ({
  id: current ? "current" : "past",
  startDate: "2026-07-01",
  nextSalaryDate: "2026-08-01",
  income: 100000,
  previousBalance: 0,
  current,
  createdAt: "",
  mandatory: [],
  everyday: [{ id: "limit", category: "еда", limit: 10000, expenses: [] }],
  oneOff: [],
  impulse: [],
});

const makeData = (): AppData => ({
  version: 1,
  categories: ["еда"],
  categoryTypes: { еда: ["everyday"] },
  everydayLimits: [{ id: "setting", category: "еда", limit: 10000 }],
  drafts: [],
  wishlist: [],
  periods: [makePeriod(true), makePeriod(false)],
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("date input", () => {
  it("adds date separators while the user types digits", () => {
    expect(formatDateInput("04082026")).toBe("04.08.2026");
    expect(formatDateInput("04a08-2026")).toBe("04.08.2026");
  });

  it("accepts only real calendar dates", () => {
    expect(fromRuDate("29.02.2024")).toBe("2024-02-29");
    expect(fromRuDate("31.02.2024")).toBe("");
  });
});

describe("backup", () => {
  it("shows the empty backup state before the first backup", () => {
    render(
      <Backup
        data={makeData()}
        save={vi.fn()}
        restore={vi.fn()}
        back={vi.fn()}
      />,
    );

    expect(screen.getByText("резервная копия ещё не создавалась")).toBeTruthy();
  });

  it("shows and updates the last backup date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00"));
    const save = vi.fn();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:backup");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    render(
      <Backup
        data={{ ...makeData(), lastBackupDate: "2026-07-02" }}
        save={save}
        restore={vi.fn()}
        back={vi.fn()}
      />,
    );

    expect(
      screen.getByText("последняя резервная копия: 2 июля 2026"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "создать резервную копию" }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ lastBackupDate: "2026-07-22" }),
      "резервная копия создана",
    );
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});

describe("wishlist", () => {
  it("adds an item with only a name and amount", () => {
    const save = vi.fn();
    render(<Wishlist data={makeData()} save={save} back={vi.fn()} />);
    expect(screen.getByText("вишлист пока пуст")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "добавить желание" }));
    fireEvent.change(screen.getByRole("textbox", { name: "название" }), {
      target: { value: "Новая сумка" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "15000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    expect(save.mock.calls[0][0].wishlist[0]).toMatchObject({
      name: "новая сумка",
      amount: 15000,
    });
  });

  it("completes an item once and creates a paid one-off purchase", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00"));
    const save = vi.fn();
    const data = {
      ...makeData(),
      wishlist: [{ id: "wish", name: "новая сумка", amount: 15000 }],
    };
    render(<Wishlist data={data} save={save} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "куплено новая сумка" }),
    );
    const saved = save.mock.calls[0][0] as AppData;
    expect(saved.wishlist[0]).toMatchObject({
      id: "wish",
      completedAt: "2026-07-27",
    });
    expect(
      saved.periods.find((period) => period.current)?.oneOff[0],
    ).toMatchObject({
      category: "покупки",
      name: "новая сумка",
      amount: 15000,
      date: "2026-07-27",
    });
  });

  it("disables completion without an active period", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00"));
    const data = {
      ...makeData(),
      wishlist: [{ id: "wish", name: "новая сумка", amount: 15000 }],
    };
    render(<Wishlist data={data} save={vi.fn()} back={vi.fn()} />);
    expect(
      screen.getByRole("checkbox", { name: "куплено новая сумка" }),
    ).toHaveProperty("disabled", true);
  });
});

describe("period creation", () => {
  it("creates a period from one screen and formats typed dates", () => {
    const onSave = vi.fn();
    render(
      <CreatePeriod data={emptyData()} onSave={onSave} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "продолжить" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "дата начала" }), {
      target: { value: "01072026" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "дата следующей зарплаты" }),
      { target: { value: "04082026" } },
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "дата следующей зарплаты",
        }) as HTMLInputElement
      ).value,
    ).toBe("04.08.2026");
    fireEvent.change(screen.getByRole("textbox", { name: "остаток" }), {
      target: { value: "50000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "создать период" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0]).toMatchObject({
      nextSalaryDate: "2026-08-04",
      income: 0,
      previousBalance: 50000,
      mandatory: [],
      oneOff: [],
    });
    expect(onSave.mock.calls[0][0].everyday).toEqual([]);
  });

  it("separates received income and previous balance in later periods", () => {
    render(
      <CreatePeriod data={makeData()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(
      screen.getByRole("textbox", { name: "доход в начале периода" }),
    ).toBeTruthy();
    expect(
      screen.getByText("зарплата и другие деньги, которые уже поступили"),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "предыдущий остаток" }),
    ).toHaveProperty("placeholder", "90 000");
  });

  it("carries an automatic limit into the next period as fixed", () => {
    const onSave = vi.fn();
    const data = makeData();
    data.everydayLimits[0] = {
      ...data.everydayLimits[0],
      limit: 500,
      automatic: true,
    };
    render(<CreatePeriod data={data} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "дата начала" }), {
      target: { value: "01082026" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "дата следующей зарплаты" }),
      { target: { value: "01092026" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "доход в начале периода" }),
      { target: { value: "100000" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "создать период" }));
    expect(onSave.mock.calls[0][0].everyday[0]).toMatchObject({
      category: "еда",
      limit: 500,
      automatic: false,
      expenses: [],
    });
  });
});

describe("period completion UI", () => {
  it("shows the no-money state at zero and below", () => {
    const zero = {
      ...makePeriod(true),
      income: 0,
      previousBalance: 0,
      everyday: [],
    };
    const { container, rerender } = render(<Home period={zero} go={vi.fn()} />);
    expect(screen.getByText("свободных денег нет").className).toContain(
      "no-free-money",
    );
    expect(screen.getByRole("heading", { name: "0 ₽" }).className).toContain(
      "no-free-money",
    );
    expect(
      container.querySelector(".hero-mascot")?.getAttribute("src"),
    ).toContain("mascot-no-money.svg");
    rerender(
      <Home
        period={{
          ...zero,
          impulse: [{ id: "expense", category: "покупки", amount: 500 }],
        }}
        go={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "-500 ₽" }).className).toContain(
      "no-free-money",
    );
  });

  it("uses green below 70, orange from 70 through 90, and red above 90", () => {
    const current = {
      ...makePeriod(true),
      everyday: [
        {
          id: "safe",
          category: "еда",
          limit: 1000,
          expenses: [{ id: "safe-expense", amount: 699 }],
        },
        {
          id: "warning",
          category: "транспорт",
          limit: 1000,
          expenses: [{ id: "warning-expense", amount: 700 }],
        },
        {
          id: "danger",
          category: "покупки",
          limit: 1000,
          expenses: [{ id: "danger-expense", amount: 901 }],
        },
      ],
    };
    const { container } = render(<Home period={current} go={vi.fn()} />);
    expect(
      container.querySelectorAll(".category-progress i.safe"),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".category-progress i.warning"),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".category-progress i.danger"),
    ).toHaveLength(1);
  });

  it("uses the shared category order on the home screen", () => {
    const current = {
      ...makePeriod(true),
      everyday: [
        { id: "transport", category: "транспорт", limit: 1000, expenses: [] },
        { id: "food", category: "еда", limit: 1000, expenses: [] },
        { id: "padel", category: "падел", limit: 1000, expenses: [] },
      ],
    };
    render(
      <Home
        period={current}
        go={vi.fn()}
        categoryOrder={["еда", "транспорт", "падел"]}
      />,
    );
    const food = screen.getByText("еда");
    const transport = screen.getByText("транспорт");
    const padel = screen.getByText("падел");
    expect(
      food.compareDocumentPosition(transport) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      transport.compareDocumentPosition(padel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("toggles an expense status on the home screen without changing its amount", () => {
    const onChange = vi.fn();
    const current = {
      ...makePeriod(true),
      mandatory: [
        {
          id: "rent",
          category: "аренда",
          amount: 30000,
          status: "предстоит" as const,
        },
      ],
    };
    const { rerender } = render(
      <Home
        period={current}
        go={vi.fn()}
        categoryOrder={["аренда"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "предстоит" }));
    expect(onChange.mock.calls[0][0].mandatory[0]).toMatchObject({
      amount: 30000,
      status: "оплачено",
    });
    rerender(
      <Home
        period={onChange.mock.calls[0][0]}
        go={vi.fn()}
        categoryOrder={["аренда"]}
        onChange={onChange}
      />,
    );
    expect(screen.queryByText("оплачено")).toBeNull();
    expect(screen.queryByRole("button", { name: "предстоит" })).toBeNull();
  });

  it("does not show paid statuses", () => {
    render(
      <Home
        period={{
          ...makePeriod(true),
          mandatory: [
            {
              id: "rent",
              category: "аренда",
              amount: 30000,
              status: "оплачено",
            },
          ],
          oneOff: [
            {
              id: "trip",
              category: "развлечения",
              name: "поездка",
              amount: 5000,
              status: "оплачено",
            },
          ],
        }}
        go={vi.fn()}
      />,
    );
    expect(screen.queryByText("оплачено")).toBeNull();
  });

  it("shows planned dates on home and all non-everyday dates on the period screen", () => {
    const current = {
      ...makePeriod(true),
      mandatory: [
        {
          id: "rent",
          category: "аренда",
          amount: 30000,
          status: "предстоит" as const,
          date: "2026-07-30",
        },
      ],
      oneOff: [
        {
          id: "trip",
          category: "развлечения",
          name: "поездка",
          amount: 5000,
          status: "оплачено" as const,
          date: "2026-07-27",
        },
      ],
      impulse: [
        {
          id: "candle",
          category: "покупки",
          name: "свеча",
          amount: 1000,
          date: "2026-07-27",
        },
      ],
    };
    const data = { ...makeData(), periods: [current, makePeriod(false)] };
    const { rerender } = render(<Home period={current} go={vi.fn()} />);
    expect(screen.getByText("30 июля")).toBeTruthy();
    expect(screen.queryByText("27 июля")).toBeNull();
    rerender(
      <PeriodScreen data={data} period={current} save={vi.fn()} go={vi.fn()} />,
    );
    expect(screen.getByText("30 июля")).toBeTruthy();
    expect(screen.getAllByText("27 июля")).toHaveLength(2);
  });

  it("edits actual everyday expenses instead of limits on the period screen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00"));
    const current = {
      ...makePeriod(true),
      everyday: [
        {
          id: "limit",
          category: "еда",
          limit: 10000,
          expenses: [
            {
              id: "expense",
              amount: 2500,
              createdAt: new Date("2026-07-22T10:15:00").toISOString(),
            },
          ],
        },
      ],
    };
    render(
      <PeriodScreen
        data={{ ...makeData(), periods: [current, makePeriod(false)] }}
        period={current}
        save={vi.fn()}
        go={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "скорректировать внесённые расходы",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "изменить расход еда" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "удалить расход еда" }),
    ).toBeTruthy();
    expect(screen.getByText("22 июля 10:15")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "изменить лимит для категории еда",
      }),
    ).toBeNull();
  });

  it("adds or changes the name while editing one-off and impulse expenses", () => {
    const save = vi.fn();
    const current = {
      ...makePeriod(true),
      oneOff: [
        {
          id: "one-off",
          category: "услуги",
          amount: 3000,
          status: "оплачено" as const,
        },
      ],
      impulse: [
        {
          id: "impulse",
          category: "покупки",
          name: "старая свеча",
          amount: 1000,
        },
      ],
    };
    render(
      <PeriodScreen
        data={{ ...makeData(), periods: [current, makePeriod(false)] }}
        period={current}
        save={save}
        go={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "изменить расход услуги" }),
    );
    fireEvent.change(screen.getByLabelText("название"), {
      target: { value: "Клининг" },
    });
    fireEvent.change(screen.getByLabelText("сумма"), {
      target: { value: "3500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    const saved = save.mock.calls[0][0] as AppData;
    expect(
      saved.periods.find((period) => period.current)?.oneOff[0],
    ).toMatchObject({
      name: "клининг",
      amount: 3500,
    });
  });

  it("adds, changes or removes a future date from a planned mandatory expense", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00"));
    const save = vi.fn();
    const current = {
      ...makePeriod(true),
      mandatory: [
        {
          id: "rent",
          category: "аренда",
          amount: 30000,
          status: "предстоит" as const,
        },
      ],
    };
    render(
      <PeriodScreen
        data={{ ...makeData(), periods: [current, makePeriod(false)] }}
        period={current}
        save={save}
        go={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "изменить расход аренда" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "дата" }), {
      target: { value: "30072026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    expect(
      (save.mock.calls[0][0] as AppData).periods.find(
        (period) => period.current,
      )?.mandatory[0],
    ).toMatchObject({
      amount: 30000,
      status: "предстоит",
      date: "2026-07-30",
    });
  });

  it("asks for confirmation before deleting an expense", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00"));
    const save = vi.fn();
    const current = {
      ...makePeriod(true),
      mandatory: [
        {
          id: "rent",
          category: "аренда",
          amount: 30000,
          status: "предстоит" as const,
        },
      ],
    };
    render(
      <PeriodScreen
        data={{ ...makeData(), periods: [current, makePeriod(false)] }}
        period={current}
        save={save}
        go={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "удалить расход аренда" }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "удалить расход?" }),
    ).toBeTruthy();
    expect(
      screen.queryByText("удалить расход «аренда» из текущего периода?"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "удалить" }));
    expect(save).toHaveBeenCalledOnce();
  });

  it("offers the next period on salary day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00"));
    render(
      <Home
        period={{ ...makePeriod(true), nextSalaryDate: "2026-08-04" }}
        go={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "создать следующий период" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "добавить расход" }),
    ).toBeTruthy();
  });

  it("freezes an overdue period and replaces expense entry with creation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00"));
    render(
      <Home
        period={{ ...makePeriod(true), nextSalaryDate: "2026-08-04" }}
        go={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "период завершён" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "создать период" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "добавить расход" }),
    ).toBeNull();
  });

  it("uses an in-app confirmation before clearing a period", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00"));
    render(
      <PeriodScreen
        data={makeData()}
        period={makePeriod(true)}
        save={vi.fn()}
        go={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "очистить текущий период" }),
    );
    expect(
      screen.getByRole("dialog", { name: "очистить текущий период?" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "отмена" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "очистить" })).toBeTruthy();
    expect(
      screen.queryByText("даты, суммы и расходы будут удалены"),
    ).toBeNull();
  });

  it("shows zero period amounts as a placeholder when editing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00"));
    const current = { ...makePeriod(true), income: 0 };
    render(
      <PeriodScreen
        data={{ ...makeData(), periods: [current, makePeriod(false)] }}
        period={current}
        save={vi.fn()}
        go={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "изменить доход" }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("0");
  });
});

describe("expense creation", () => {
  it("does not save a zero-value expense", () => {
    const save = vi.fn();
    const data = makeData();
    render(
      <AddExpense
        data={data}
        period={data.periods.find((item) => item.current)!}
        save={save}
        done={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "категория" }), {
      target: { value: "еда" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить расход" }));
    expect(
      screen.getByText("сумма расхода должна быть больше нуля"),
    ).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("records the current moment without showing a date field", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:34:00"));
    const save = vi.fn();
    const data = makeData();
    const current = data.periods.find((item) => item.current)!;
    render(
      <AddExpense data={data} period={current} save={save} done={vi.fn()} />,
    );
    expect(screen.queryByRole("textbox", { name: "дата" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "категория" }), {
      target: { value: "еда" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "1200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить расход" }));
    const saved = save.mock.calls[0][0] as AppData;
    expect(
      saved.periods.find((item) => item.current)?.everyday[0].expenses.at(-1),
    ).toMatchObject({
      amount: 1200,
      createdAt: new Date("2026-07-23T12:34:00").toISOString(),
    });
  });

  it("does not show status or date controls for an unplanned expense", () => {
    const data = {
      ...makeData(),
      categories: ["услуги"],
      categoryTypes: { услуги: ["oneOff" as const] },
    };
    render(
      <AddExpense
        data={data}
        period={data.periods.find((item) => item.current)!}
        save={vi.fn()}
        done={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "тип расхода" }), {
      target: { value: "oneOff" },
    });
    expect(screen.queryByRole("combobox", { name: "статус" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "дата" })).toBeNull();
  });

  it("requires a one-off name and dates a paid expense today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00"));
    const save = vi.fn();
    const data = {
      ...makeData(),
      categories: ["услуги"],
      categoryTypes: { услуги: ["oneOff" as const] },
    };
    render(
      <AddExpense
        data={data}
        period={data.periods.find((item) => item.current)!}
        save={save}
        done={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "тип расхода" }), {
      target: { value: "oneOff" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "категория" }), {
      target: { value: "услуги" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "3000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "название" }), {
      target: { value: "Клининг" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить расход" }));
    expect(
      (save.mock.calls[0][0] as AppData).periods.find((item) => item.current)
        ?.oneOff[0],
    ).toMatchObject({
      name: "клининг",
      date: "2026-07-27",
    });
  });

  it("records a required impulse name and today's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00"));
    const save = vi.fn();
    const data = {
      ...makeData(),
      categories: ["покупки"],
      categoryTypes: { покупки: ["impulse" as const] },
    };
    render(
      <AddExpense
        data={data}
        period={data.periods.find((item) => item.current)!}
        save={save}
        done={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "тип расхода" }), {
      target: { value: "impulse" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "категория" }), {
      target: { value: "покупки" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "название" }), {
      target: { value: "Свеча" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить расход" }));
    expect(
      (save.mock.calls[0][0] as AppData).periods.find((item) => item.current)
        ?.impulse[0],
    ).toMatchObject({
      name: "свеча",
      date: "2026-07-27",
    });
  });

  it("creates a future planned expense without a status control", () => {
    const save = vi.fn();
    const data = {
      ...makeData(),
      categories: ["аренда"],
      categoryTypes: { аренда: ["mandatory" as const] },
    };
    render(
      <AddExpense
        data={data}
        period={data.periods.find((item) => item.current)!}
        save={save}
        done={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "тип расхода" }), {
      target: { value: "mandatory" },
    });
    expect(screen.queryByRole("combobox", { name: "статус" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "категория" }), {
      target: { value: "аренда" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "30000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "дата" }), {
      target: { value: "29072026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить расход" }));
    expect(
      (save.mock.calls[0][0] as AppData).periods.find((item) => item.current)
        ?.mandatory[0],
    ).toMatchObject({
      status: "предстоит",
      date: "2026-07-29",
    });
  });

  it("allows several planned expenses in one category and an optional name", () => {
    const save = vi.fn();
    const data = {
      ...makeData(),
      categories: ["красота"],
      categoryTypes: { красота: ["mandatory" as const] },
    };
    const current = {
      ...data.periods.find((item) => item.current)!,
      mandatory: [
        {
          id: "first",
          category: "красота",
          name: "стрижка",
          amount: 3000,
          status: "предстоит" as const,
        },
      ],
    };
    render(
      <AddExpense data={data} period={current} save={save} done={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "тип расхода" }), {
      target: { value: "mandatory" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "категория" }), {
      target: { value: "красота" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "5000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "дата" }), {
      target: { value: "29072026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить расход" }));
    const saved = save.mock.calls[0][0] as AppData;
    expect(saved.periods.find((item) => item.current)?.mandatory).toHaveLength(
      2,
    );
    expect(
      saved.periods.find((item) => item.current)?.mandatory[1].name,
    ).toBeUndefined();
  });

  it("accepts today and treats the planned expense as paid immediately", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00"));
    const save = vi.fn();
    const data = {
      ...makeData(),
      categories: ["аренда"],
      categoryTypes: { аренда: ["mandatory" as const] },
    };
    render(
      <AddExpense
        data={data}
        period={data.periods.find((item) => item.current)!}
        save={save}
        done={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "тип расхода" }), {
      target: { value: "mandatory" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "категория" }), {
      target: { value: "аренда" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "сумма" }), {
      target: { value: "30000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "дата" }), {
      target: { value: "27072026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить расход" }));
    expect(
      (save.mock.calls[0][0] as AppData).periods.find((item) => item.current)
        ?.mandatory[0],
    ).toMatchObject({
      status: "оплачено",
      date: "2026-07-27",
    });
  });
});

describe("category settings UI", () => {
  it("shows zero amounts as a placeholder in money dialogs", () => {
    const data = {
      ...makeData(),
      everydayLimits: [],
      periods: [
        { ...makePeriod(true), everyday: [] },
        { ...makePeriod(false), everyday: [] },
      ],
    };
    render(<Categories data={data} save={vi.fn()} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "изменить лимит для категории еда",
      }),
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("0");
  });

  it("does not turn an untouched zero placeholder into a fixed limit", () => {
    const save = vi.fn();
    const data = {
      ...makeData(),
      everydayLimits: [],
      periods: [
        { ...makePeriod(true), everyday: [] },
        { ...makePeriod(false), everyday: [] },
      ],
    };
    render(<Categories data={data} save={save} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "изменить лимит для категории еда",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    expect(screen.getByText("введите сумму")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps reusable limits in settings and applies edits to the current period", () => {
    const save = vi.fn();
    const data = makeData();
    data.everydayLimits[0].automatic = true;
    data.periods.find((period) => period.current)!.everyday[0].automatic = true;
    render(<Categories data={data} save={save} back={vi.fn()} />);
    const limitHeading = screen.getByRole("heading", {
      name: "повседневные лимиты",
    });
    const plannedHeading = screen.getByRole("heading", {
      name: "запланированные расходы",
    });
    const categoryHeading = screen.getByRole("heading", {
      name: "категории",
    });
    expect(
      plannedHeading.compareDocumentPosition(limitHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      limitHeading.compareDocumentPosition(categoryHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "изменить лимит для категории еда",
      }),
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "12000" } });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    const saved = save.mock.calls[0][0] as AppData;
    expect(saved.everydayLimits[0].limit).toBe(12000);
    expect(saved.everydayLimits[0].automatic).toBe(false);
    expect(
      saved.periods.find((period) => period.current)?.everyday[0].limit,
    ).toBe(12000);
    expect(
      saved.periods.find((period) => period.current)?.everyday[0].automatic,
    ).toBe(false);
    expect(
      saved.periods.find((period) => !period.current)?.everyday[0].limit,
    ).toBe(10000);
  });

  it("returns a category with spending to automatic mode after saving zero", () => {
    const save = vi.fn();
    const data = makeData();
    data.everydayLimits[0] = {
      ...data.everydayLimits[0],
      limit: 500,
      automatic: true,
    };
    data.periods.find((period) => period.current)!.everyday[0] = {
      ...data.periods.find((period) => period.current)!.everyday[0],
      limit: 500,
      automatic: true,
      expenses: [{ id: "expense", amount: 500 }],
    };
    render(<Categories data={data} save={save} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "изменить лимит для категории еда",
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    const saved = save.mock.calls[0][0] as AppData;
    expect(saved.everydayLimits[0]).toMatchObject({
      limit: 500,
      automatic: true,
    });
    expect(
      saved.periods.find((period) => period.current)?.everyday[0],
    ).toMatchObject({
      limit: 500,
      automatic: true,
      expenses: [{ id: "expense", amount: 500 }],
    });
  });

  it("removes a limit after saving zero without spending", () => {
    const save = vi.fn();
    render(<Categories data={makeData()} save={save} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "изменить лимит для категории еда",
      }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    const saved = save.mock.calls[0][0] as AppData;
    expect(saved.everydayLimits).toEqual([]);
    expect(saved.periods.find((period) => period.current)?.everyday).toEqual(
      [],
    );
  });

  it("opens a compact add-category form with a short submit label", () => {
    render(<Categories data={makeData()} save={vi.fn()} back={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "добавить категорию" }));
    expect(
      screen.getByRole("heading", { name: "добавить категорию" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "добавить" })).toBeTruthy();
  });

  it("uses the category itself as the edit-dialog title", () => {
    render(<Categories data={makeData()} save={vi.fn()} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "изменить категорию еда" }),
    );
    expect(screen.getByRole("heading", { name: "еда" })).toBeTruthy();
  });

  it("blocks deletion while the current period has an active limit", () => {
    const save = vi.fn();
    const data = makeData();
    render(<Categories data={data} save={save} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "удалить категорию еда" }),
    );
    expect(save).toHaveBeenCalledWith(
      data,
      "нельзя удалить категорию, пока у неё есть активный лимит",
    );
    expect(
      screen.queryByRole("heading", { name: "удалить категорию" }),
    ).toBeNull();
  });

  it("uses a concise category deletion confirmation", () => {
    const data = {
      ...makeData(),
      everydayLimits: [],
      periods: [
        { ...makePeriod(true), everyday: [] },
        { ...makePeriod(false), everyday: [] },
      ],
    };
    render(<Categories data={data} save={vi.fn()} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "удалить категорию еда" }),
    );
    expect(
      screen.getByRole("dialog", { name: "удалить категорию?" }),
    ).toBeTruthy();
    expect(screen.getByText("ранее внесённые расходы сохранятся")).toBeTruthy();
    expect(screen.queryByText("удалить категорию «еда»?")).toBeNull();
  });

  it("renames the current period without rewriting completed history", () => {
    const save = vi.fn();
    render(<Categories data={makeData()} save={save} back={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "изменить категорию еда" }),
    );
    fireEvent.change(screen.getByLabelText("название"), {
      target: { value: "продукты" },
    });
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    const saved = save.mock.calls[0][0] as AppData;
    expect(
      saved.periods.find((period) => period.current)?.everyday[0].category,
    ).toBe("продукты");
    expect(
      saved.periods.find((period) => !period.current)?.everyday[0].category,
    ).toBe("еда");
    expect(saved.everydayLimits[0].category).toBe("продукты");
  });
});
