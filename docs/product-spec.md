# Product Specification

> Status: final MVP specification

## 1. Product overview

Cushion is a personal financial planning app.

The planning period is the time between one salary and the next, not a calendar month.

The app should help the user answer:

> can i afford this purchase before my next salary?

The main value shown in the app is **свободные деньги**.

## 2. MVP scope

The MVP must support:

- creating a financial period;
- carrying the previous balance into a new period;
- planning mandatory payments;
- setting everyday spending limits;
- adding one-off expenses;
- adding impulse purchases;
- calculating free money;
- updating expenses during the period;
- viewing the current period;
- viewing period history;
- editing categories;
- creating and restoring a local backup.

The MVP must not include:

- user accounts;
- cloud storage;
- multi-device sync;
- savings goals;
- investments;
- shared budgets;
- bank integrations;
- detailed analytics;
- notifications.

## 3. Language and UI writing

### 3.1 Application language

All user-facing interface text must be in Russian.

This includes:

- screen titles;
- navigation labels;
- buttons;
- field labels;
- statuses;
- hints;
- empty states;
- validation messages;
- confirmation messages.

Source code, technical identifiers and documentation may remain in English.

### 3.2 Capitalisation

All interface text must start with a lowercase letter unless Russian grammar requires otherwise.

Examples:

- `свободные деньги`
- `обязательные платежи`
- `добавить расход`
- `предстоит`
- `оплачено`

Do not use title case.

### 3.3 Fixed UI terminology

| Internal concept   | Required UI text               |
| ------------------ | ------------------------------ |
| Free Money         | `свободные деньги`             |
| Financial Period   | `период`                       |
| Mandatory Payments | `обязательные расходы`         |
| Everyday Expenses  | `повседневные расходы`         |
| One-off Expenses   | `разовые расходы`              |
| Impulse Purchases  | `импульсивные покупки`         |
| Add Expense        | `добавить расход`              |
| Home               | `главная`                      |
| Period             | `период`                       |
| More               | `ещё`                          |
| Planned            | `предстоит`                    |
| Paid               | `оплачено`                     |
| Backup             | `резервная копия`              |
| Restore Backup     | `восстановить резервную копию` |

Do not replace these terms with synonyms without an explicit product decision.

## 4. Categories

Categories are displayed in Russian and lowercase.

The confirmed initial category list is:

- `аренда`
- `еда`
- `транспорт`
- `дом и гигиена`
- `красота`
- `падел`
- `покупки`
- `здоровье`
- `развлечения`
- `подписки`
- `регулярные платежи`
- `услуги`
- `сплит`
- `долг`

Categories are analytical labels only.

A category does not determine financial behaviour. Expense type determines financial behaviour.

The user may add, rename, reorder and delete categories. A category may belong to multiple expense types, and those types can be edited. Lists filtered by expense type preserve the relative order of this shared category list.

Deleting a category must not delete existing expenses. A category cannot be deleted while it has an active everyday limit or everyday spending in the current period. Existing expenses in completed periods retain their original category value.

Renaming a category updates the current period, drafts and future operations. Completed periods remain unchanged.

## 5. Number formatting

Amounts up to four digits are displayed without a thousands separator.

Examples:

- `6000`
- `9999`

Amounts of five digits and more use a space as the thousands separator.

Examples:

- `10 000`
- `45 000`
- `120 000`

Use this rule consistently across the entire interface.

## 6. Financial period

### 6.1 Definition

A financial period starts when income is received and ends when the next expected income is received.

A period contains:

- start date;
- next salary date;
- income;
- previous balance;
- selected mandatory payments;
- everyday spending limits;
- one-off expenses;
- impulse purchases.

Only one period can be current.

### 6.2 Creating a period

The user creates a period after receiving salary.

Period creation is a single-screen form. Every period contains:

1. start date;
2. next salary date;

For the first period, the money field is `остаток` with the explanation `сколько денег доступно до следующей зарплаты`. It becomes the opening balance; initial income is zero.

For later periods, the form also contains:

3. `доход в начале периода`, explained as `зарплата и другие деньги, которые уже поступили`;
4. `предыдущий остаток`.

The start date defaults to today but remains editable. After saving, the app opens `главная` and the user adds expenses separately.

For a subsequent period, a positive final free-money amount from the previous period is offered as a grey previous-balance suggestion. Zero or a negative amount produces a `0` suggestion. The user may replace it.

Mandatory expenses and one-off expenses are not copied automatically. Everyday limits from the previous period are copied with their spending reset to zero and remain editable on `период`.

### 6.3 Previous balance

Previous balance is money carried into the new period.

It may be positive, zero or negative.

It is added to income when calculating free money.

### 6.4 Closing a period

Creating a new period makes the previous current period historical.

The current period remains active throughout the next-salary date. On that date, `создать следующий период` is offered on the main screen. From the following calendar day, if no new period was created, the current period is shown as finished and becomes read-only: expenses, income, limits and other values are no longer changed or recalculated. The user may still move the next-salary date forward if the salary was delayed, which makes the period active again.

The finished-period state offers `создать период` on the main screen. A period is never closed automatically before the user creates its successor.

Historical periods remain readable.

Editing historical periods is outside MVP scope.

## 7. Expense model

Every expense has:

- type;
- category;
- amount.

There is no separate expense name field.

The MVP supports four expense types.

### 7.1 Mandatory payments

Mandatory payments are known obligations reserved for the current period.

Examples include rent, subscriptions, debt payments and instalments.

Fields:

- category;
- amount;
- status.

Statuses:

- `предстоит`
- `оплачено`

Rules:

- the amount is reserved immediately when the payment is added to the period;
- changing status from `предстоит` to `оплачено` must not subtract the amount again;
- status is informational;
- a mandatory payment may be edited or deleted during the current period.

#### Mandatory payment drafts

When creating a new period, the app shows a draft list based on mandatory payments used previously.

Each draft contains:

- category;
- last amount;
- last payment date.

The app must not automatically add all previous mandatory payments.

The user selects which drafts belong to the new period and may edit their amounts before confirming.

This avoids incorrect copying of payments with different recurrence frequencies.

### 7.2 Everyday expenses

Everyday expenses are managed through category limits.

Each everyday category contains:

- category;
- limit;
- spent;
- still planned.

Formula:

```text
still planned = limit - spent
```

Rules:

- everyday limits are reserved in free money from the start of the period;
- when adding an everyday expense, the user enters only the new expense amount;
- the entered amount increases `spent`;
- the user must not enter cumulative spending totals;
- `still planned` updates automatically;
- the user may edit the limit during the current period;
- if `spent` exceeds `limit`, `still planned` becomes negative.

#### Everyday limit drafts

Limits from the previous period are copied into the new period with spending reset to zero. The user may edit them on `период`.

If an everyday expense is added to a category whose current-period limit is zero or absent, that first expense creates a limit equal to its amount. If a non-zero limit already exists, overspending must not increase it: the remaining amount becomes negative and is shown in the danger colour.

### 7.3 One-off expenses

One-off expenses are known non-recurring expenses planned for the current period.

Fields:

- category;
- amount;
- optional date;
- status.

Statuses:

- `предстоит`
- `оплачено`

Rules:

- the amount is reserved immediately;
- changing status must not subtract the amount again;
- the expense may be edited or deleted during the current period.

### 7.4 Impulse purchases

Impulse purchases are unplanned purchases recorded after the decision or purchase.

Fields:

- category;
- amount.

Rules:

- the amount reduces free money immediately;
- no date or status is required in the MVP;
- the purchase may be edited or deleted during the current period.

## 8. Free money calculation

The calculation is:

```text
free money =
income
+ previous balance
- planned mandatory payments
- everyday spent
- everyday still planned
- planned one-off expenses
- impulse purchases
```

Because:

```text
everyday spent + everyday still planned = everyday limit
```

the entire everyday limit remains reserved until the user changes the limit.

Mandatory and one-off expenses are counted once regardless of status.

The UI must update free money immediately after every relevant change.

## 9. Main user flow

```text
receive salary
→ create period
→ view the created period on главная
→ add expenses or adjust limits when needed
→ use the app during the period
→ create the next period
```

## 10. Navigation

Bottom navigation contains:

- `главная`
- `период`
- `ещё`

The global `добавить расход` action appears only on `главная`.

Other screens may use contextual actions.

## 11. Screens

### 11.1 Главная

Purpose: show the current financial situation and provide quick expense entry.

Must display:

- current period dates;
- days until next salary;
- `свободные деньги`;
- `обязательные платежи`;
- `повседневные расходы`;
- `разовые расходы`;
- `импульсивные покупки`.

Primary action:

- `добавить расход`

The free money value must be the strongest visual element.

### 11.2 Добавить расход

Purpose: record a new expense.

This is one dynamic form.

The first field is expense type:

- `обязательные платежи`
- `повседневные расходы`
- `разовые расходы`
- `импульсивные покупки`

The remaining fields change according to the selected type.

Mandatory payment creation remains available here as an edge case.

### 11.3 Период

Purpose: manage the current financial period.

Must support:

- viewing period dates;
- viewing income and previous balance;
- editing current-period values where allowed;
- adding a mandatory payment;
- viewing all current-period expense groups.

Creating the next period is available from this screen.

### 11.4 Создание периода

Purpose: create the next financial period.

The screen contains only the four fields defined in section 6.2 and one `создать период` action. Saving opens `главная`.

### 11.5 Ещё

Purpose: provide infrequent management actions.

Contains:

- combined category and mandatory-expense settings;
- period history;
- backup.

### 11.6 Categories

Purpose: manage the category list.

The screen must support:

- viewing categories;
- adding a category;
- renaming a category;
- deleting a category.

Category names remain Russian and lowercase.

### 11.7 Mandatory payment drafts

Purpose: manage reusable mandatory payment drafts.

The user may:

- add a draft;
- edit category and amount;
- delete a draft.

Drafts are suggestions only and are never automatically added to a new period.

### 11.8 Period history

Purpose: view previous financial periods.

The user may open a period and view its final values and expenses.

Historical periods are read-only in the MVP.

### 11.9 Backup

Purpose: protect locally stored data.

The screen must support:

- creating a JSON backup file;
- restoring data from a valid Cushion JSON backup.

The user-facing term is `резервная копия`, not `экспорт`.

Before restoring, the app must warn that current local data will be replaced.

## 12. Storage

The MVP has no login and stores data locally.

Use IndexedDB rather than localStorage.

All data access must go through a dedicated storage layer.

The UI and business logic must not depend directly on IndexedDB APIs.

This allows local storage to be replaced by cloud storage in a future version without rewriting planner logic.

## 13. Validation and error handling

Required validation:

- amount must be a valid number;
- amount must not be negative unless explicitly allowed for previous balance;
- next salary date must be after the period start date;
- category is required for every expense;
- expense type is required;
- everyday limit must not be negative;
- backup file must match the expected Cushion backup structure.

Every date field uses the same numeric input behaviour: typing `04082026` displays `04.08.2026`, non-digit characters are ignored, input is limited to eight digits, and the completed value must be a real calendar date.

Errors must be shown in Russian and start with a lowercase letter.

User input must not be lost after a validation error.

## 14. Empty states

Empty states should explain the next action without promotional language.

Examples:

- no current period: offer to create a period;
- no mandatory payments: offer to add one;
- no one-off expenses: state that none are planned;
- no impulse purchases: state that none have been added;
- no history: state that completed periods will appear here.

All empty-state text must follow the lowercase rule.

## 15. Acceptance criteria

The MVP is ready for use when the user can:

1. create a financial period;
2. use saved mandatory-expense amounts as optional suggestions;
3. edit copied everyday limits on the current period;
4. add all four expense types;
5. see free money update correctly;
6. mark mandatory and one-off expenses as paid without double subtraction;
7. create the next period while preserving history;
8. manage Russian-language categories;
9. create and restore a JSON backup;
10. use the complete interface in Russian with lowercase UI labels.
