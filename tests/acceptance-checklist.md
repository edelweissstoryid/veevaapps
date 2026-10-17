# Acceptance checklist — before production release

## Auth & roles
- [ ] Active Admin can login; inactive/unmapped account is rejected.
- [ ] Owner can login and read dashboard, products, reports.
- [ ] Owner cannot call `save_transaction`, `delete_transaction`, `save_product`, `adjust_stock`, or `archive_product`.
- [ ] Anonymous users cannot read any protected table.
- [ ] Role cannot be changed by a user through client-side requests.

## Transaction correctness
- [ ] Create income/expense transaction; correct category, payment and date appear.
- [ ] Edit transaction without item lines; row and report totals update.
- [ ] Soft-delete requires UI confirmation and excludes transaction from reports.
- [ ] Double-click/submission network retry does not silently create duplicate records; test slow network conditions.
- [ ] Invalid amount/category/stock inputs return readable errors.

## Inventory consistency
- [ ] New product opening quantity writes `opening_balance` movement.
- [ ] Income transaction linked to items reduces stock.
- [ ] Expense transaction linked to items increases stock.
- [ ] Editing linked transaction reverses previous impact then applies new impact atomically.
- [ ] Deleting linked transaction reverses its stock impact atomically.
- [ ] Sale cannot reduce stock below zero.
- [ ] Reversing a previously received item cannot silently produce negative stock.
- [ ] Manual adjustment requires a reason and ledger balance checks pass.
- [ ] Concurrent edits/transactions preserve correct saldo under row locks.

## Reports
- [ ] Daily filter uses Asia/Jakarta date boundary.
- [ ] YTD is Jan 1 through the selected date, excluding soft-deleted transactions.
- [ ] Transfer income + cash income equals total income.
- [ ] Expense is not mislabeled as profit; cash-flow difference is labeled accurately.
- [ ] Monthly chart sums reconcile with detailed rows when compared for a month.
- [ ] Empty period displays an explicit empty state, not fake zeros disguised as seeded data.

## UI & deployment
- [ ] Keyboard focus is visible and forms show validation errors.
- [ ] Tables work on small screens with horizontal overflow; main controls remain reachable.
- [ ] Loading, error, empty and success states are exercised.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] Preview deployment checked before production.
- [ ] No service role key/DB password checked into Git or sent to browser.
