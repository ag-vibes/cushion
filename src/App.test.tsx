import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Categories, CreatePeriod, formatDateInput, fromRuDate } from "./App";
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
  drafts: [],
  periods: [makePeriod(true), makePeriod(false)],
});

afterEach(cleanup);

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

describe("category settings UI", () => {
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
  });
});
