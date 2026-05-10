# Tests

This project is Google Apps Script based, so executable test helpers must stay in `src/Test_Dev.gs` to run inside Apps Script.

Safe helpers:

```text
testTextCommand_()
testReceiptJsonParse_()
testManualLabor_()
testExpenseQueryKeys_()
testExpenseQueryBuilder_()
```

Write helpers are guarded and will not write unless Script Property `ENABLE_DEV_WRITES=true`:

```text
testFirestoreSave_()
testSheetSave_()
```

Before pushing to GitHub, run:

```powershell
.\scripts\scan-secrets.ps1
```
