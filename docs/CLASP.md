# clasp Operations

The primary safe workflow is documented in the repository root:

```text
CLASP.md
```

Use this checklist before pushing code to Google Apps Script or GitHub:

```powershell
.\scripts\scan-secrets.ps1
clasp status
clasp push
```

Important:

- `.clasp.json` is local only and ignored by Git.
- `.clasprc.json` is local auth state and must never be committed.
- Script Properties are not uploaded by `clasp push`.
- Keep all tokens, API keys, Sheet IDs, webhook secrets, and Firebase config in Apps Script Script Properties.
