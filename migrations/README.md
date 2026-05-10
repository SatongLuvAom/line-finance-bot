# Migrations

Executable Apps Script migrations live in `src/Migration_Service.gs` so they can be pushed and run from Apps Script.

Current migration:

```text
backfillExpenseQueryKeys(batchSize)
```

Recommended production run:

```text
backfillExpenseQueryKeys(100)
```

Run repeatedly until the returned object has:

```text
hasNextPage=false
```

The function caps `batchSize` at `200` to reduce Apps Script timeout risk.
