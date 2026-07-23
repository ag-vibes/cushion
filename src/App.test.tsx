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
});

describe("period completion UI", () => {
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
    render(
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
  it("records the current moment without showing a date field", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:34:00"));
    const save = vi.fn();
    const data = makeData();
    const current = data.periods.find((item) => item.current)!;
    render(
      <AddExpense
        data={data}
        period={current}
        save={save}
        done={vi.fn()}
      />,
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
      saved.periods
        .find((item) => item.current)
        ?.everyday[0].expenses.at(-1),
    ).toMatchObject({
      amount: 1200,
      createdAt: new Date("2026-07-23T12:34:00").toISOString(),
    });
  });

  it("hides the date for a paid one-off expense", () => {
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
    expect(
      screen.getByRole("textbox", { name: "дата, необязательно" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "статус" }), {
      target: { value: "оплачено" },
    });
    expect(
      screen.queryByRole("textbox", { name: "дата, необязательно" }),
    ).toBeNull();
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

  it("keeps reusable limits in settings and applies edits to the current period", () => {
    const save = vi.fn();
    const data = makeData();
    data.everydayLimits[0].automatic = true;
    data.periods.find((period) => period.current)!.everyday[0].automatic = true;
    render(<Categories data={data} save={save} back={vi.fn()} />);
    const limitHeading = screen.getByRole("heading", {
      name: "повседневные лимиты",
    });
    const mandatoryHeading = screen.getByRole("heading", {
      name: "обязательные расходы",
    });
    const categoryHeading = screen.getByRole("heading", {
      name: "категории",
    });
    expect(
      limitHeading.compareDocumentPosition(mandatoryHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      mandatoryHeading.compareDocumentPosition(categoryHeading) &
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
