# Architecture

This file is optional reference material. The required operational docs are `COMMANDS.md`, `DEPLOYMENT.md`, `DATABASE_SCHEMA.md`, `SHEET_SCHEMA.md`, and `MAINTENANCE.md`.

## Flow

```mermaid
flowchart TD
  LINE["LINE Webhook"] --> Main["Main.gs doPost"]
  Main --> Security["Security.gs"]
  Main --> Router["Router.gs"]
  Router --> Commands["Command_Handler.gs"]
  Router --> Receipt["Receipt_Service.gs"]
  Receipt --> AI["AI_Engine.gs"]
  AI --> Normalizer["AI_Normalizer.gs"]
  Normalizer --> Bank["AI_BankParser.gs"]
  Receipt --> Storage["Storage_Repository.gs"]
  Receipt --> Firestore["Firestore_Repository.gs"]
  Receipt --> Sheet["Sheet_Repository.gs"]
  Commands --> Labor["Labor_Service.gs"]
  Commands --> Summary["Summary_Service.gs"]
  Commands --> UI["Line_UI.gs / Flex_Builder.gs"]
```

## Indexed Query Architecture

Normal bot commands read Firestore through `Firestore_Query.gs`, not through full collection scans.

```mermaid
flowchart TD
  Command["Command Handler"] --> Query["queryExpenses(options)"]
  Query --> Build["buildCompositeFilter / buildOrderBy"]
  Build --> Run["firestoreRunQuery(:runQuery)"]
  Run --> Firestore["Firestore expenses"]
  Firestore --> Mapper["getFirestoreRecordFromDocument_"]
  Mapper --> Reply["LINE Text/Flex Reply"]
```

Write flow computes query keys before saving:

```text
record.date / occurredAt
  -> dateKey
  -> monthKey
  -> weekKey
record.job + JOB_ALIASES
  -> jobNameNormalized
  -> jobId
record.category + CATEGORY_ALIASES
  -> categoryId
record.merchant
  -> vendorId or workerId
record content
  -> fingerprint
status
  -> isActive
```

`getAllExpenses()` is retained only for legacy/dev maintenance and must not be used by normal bot commands.
