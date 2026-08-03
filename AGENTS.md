# AGENTS.md

## Objective

Build the Cushion MVP exactly as defined in:

- `docs/product-principles.md`
- `docs/product-spec.md`

These documents are the source of truth.

## Working rules

1. Do not invent features.
2. Do not implement roadmap ideas that are outside the MVP.
3. Do not replace fixed Russian UI terms with synonyms.
4. Keep category names in Russian and lowercase.
5. Keep all other user-facing interface text in Russian and lowercase.
6. Follow the number-formatting rule from the product specification.
7. Expense type determines financial behaviour; category does not.
8. Mandatory and one-off expense status must never cause double subtraction.
9. Use IndexedDB through a replaceable storage layer.
10. Keep UI, business logic and storage separated.
11. Prefer the simplest implementation that satisfies the specification.
12. Do not add authentication, cloud sync, analytics, notifications or bank integrations.
13. Ask only when requirements conflict or a required behaviour is genuinely unspecified.
14. When a technical choice is not specified, choose a stable and simple option appropriate for a small local-first web app.
15. Add tests for financial calculations and status-change behaviour before considering the MVP complete.
16. Before every iteration of changes, check the full requested scope against the current product logic, existing scenarios and source-of-truth documents. Identify contradictions, duplicated behaviour and edge cases before editing files.
17. If a requested change conflicts with current logic or introduces an unresolved inconsistency, stop and resolve the product decision with the user before implementation.
18. Every change must preserve or simplify the architecture. Do not add parallel models, duplicate state, special-case flows or abstractions unless they are strictly required by the approved MVP behaviour.
19. After every iteration, verify that the resulting behaviour remains internally consistent, does not break existing scenarios and is reflected in the relevant tests and product documentation.

## Implementation sequence

1. Set up the application structure.
2. Implement domain models and financial calculations.
3. Implement the IndexedDB storage layer.
4. Implement financial-period creation.
5. Implement the main screen.
6. Implement the dynamic add-expense form.
7. Implement period management and history.
8. Implement category and mandatory-draft management.
9. Implement JSON backup and restore.
10. Verify all acceptance criteria from `docs/product-spec.md`.

## Definition of done

The MVP is done only when all acceptance criteria in `docs/product-spec.md` are met and the core financial rules are covered by tests.
