# PDF fonts (static assets)

These Google Noto faces are **lazy-loaded** by `lib/export/unicodePdfFont.ts`
when a PDF export contains matching Unicode scripts.

They are **not** part of the JavaScript bundle. First export of a script
downloads the face from this folder into jsPDF’s VFS (cached in memory for
the session).

## Setup

```bash
# From frontend/
npm run fonts:pdf
```

Total size is ~50 MB, dominated by CJK Variable TTF subsets (~9–17 MB each).
Non-CJK scripts are only a few MB combined.

License: SIL Open Font License 1.1
