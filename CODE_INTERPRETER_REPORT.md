# Code Interpreter — Implementation Report

Production-grade Python Code Interpreter for VANI AI: isolated per-user sandbox, notebook-style sessions, streaming I/O, file/plot artifacts, and integrations with Agents, Deep Research, and Canvas.

## Status

| Area | Status |
|------|--------|
| Backend sandbox services | Done |
| HTTP API (`/api/code/*`) | Done |
| Security controls | Done |
| Agent tool (`code_execution`) | Done |
| Deep Research analysis bridge | Done |
| Canvas chart publish | Done |
| Frontend panel (editor / run / output / files / charts) | Done |
| Docker Python deps | Done |
| `npm run build` / lint (backend + CI-relevant frontend files) | Passed |

Enable with:

```bash
VANI_ENABLE_CODE_EXECUTION=true
```

Requires Python 3 and packages from `backend/requirements-code-interpreter.txt`.

---

## Architecture

```
frontend/components/codeInterpreter/  →  /api/code/*  →  SessionManager
                                                          ├── SandboxManager (policy / health)
                                                          ├── PythonRunner (kernel IPC)
                                                          ├── FileManager (workspace / quota)
                                                          └── kernel/bootstrap.py
```

### Backend (`backend/services/codeInterpreter/`)

| File | Role |
|------|------|
| `SandboxManager.ts` | Feature flag, limits, code validation, health (Python + packages) |
| `PythonRunner.ts` | Long-lived Python kernel, NDJSON stdin/stdout protocol, interrupt/reset |
| `FileManager.ts` | Per-session workspace, uploads, generated-file sync, disk quota |
| `SessionManager.ts` | Per-user sessions, execute / interrupt / restart, idle cleanup |
| `kernel/bootstrap.py` | Restricted interpreter: networking/shell blocked, rlimits, matplotlib Agg |
| `init.js` | Boot wiring + cleanup monitor |

### API (`/api/code`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Sandbox readiness (Python, packages, limits) |
| POST | `/sessions` | Create isolated session |
| GET | `/sessions` | List user sessions |
| GET | `/sessions/:id` | Session snapshot |
| DELETE | `/sessions/:id` | Destroy session + wipe workspace |
| POST | `/sessions/:id/execute` | Run code (`stream: true` → SSE) |
| POST | `/sessions/:id/interrupt` | Interrupt running cell |
| POST | `/sessions/:id/restart` | Restart kernel (clear variables) |
| POST | `/sessions/:id/files` | Upload input file (multipart `file`) |
| GET | `/sessions/:id/files/:fileId` | Download generated/uploaded file |
| POST | `/sessions/:id/publish-canvas` | Publish latest plot to Canvas |
| GET | `/audit` | Recent audit events |

All mutating routes are authenticated and rate-limited.

---

## Capabilities

- **Python execution** with persistent globals (notebook-style)
- **Data stack**: NumPy, Pandas, Matplotlib, OpenPyXL, ReportLab, Pillow
- **CSV / XLSX / PDF / ZIP / image** processing via uploads + generated outputs
- **Chart generation** (`plt.show()` → `plots/plot_N.png`)
- **Streaming stdout/stderr** over SSE
- **Interrupt** (SIGINT → SIGTERM) and **kernel restart**
- **Automatic cleanup** of idle / expired sessions and workspaces

Preloaded aliases inside the kernel: `np`, `pd`, `plt`, `WORKSPACE`, `INPUTS`, `OUTPUTS`, `PLOTS`.

---

## Security

| Control | Implementation |
|---------|----------------|
| Feature flag | `VANI_ENABLE_CODE_EXECUTION` (default off) |
| No networking | Kernel blocks `socket` / `urllib` / `requests` / etc.; Linux `unshare -n` when available |
| Restricted FS | Workspace-only `open()`; Node resolves paths under session root |
| No shell escape | Blocks `subprocess`, `os.system` / `exec*` / `fork` / `spawn`, `ctypes`, `pty` |
| CPU limit | `RLIMIT_CPU` + wall-clock timeout (`VANI_CI_TIMEOUT_MS`, default 30s) |
| Memory limit | `RLIMIT_AS` (`VANI_CI_MEMORY_MB`, default 512) |
| Disk quota | `FileManager.assertQuota` (`VANI_CI_DISK_MB`, default 256) |
| Process hygiene | Strips proxy/API keys from kernel env; `PYTHONNOUSERSITE=1` |
| Auth | JWT `requireAuth`; downloads accept `access_token` query for `<img>` / anchors |
| Audit logging | `codeLog` trail (create / execute / interrupt / upload / destroy) |
| Rate limits | 40 exec / 30 upload per minute per client |

---

## Frontend

| Piece | Path |
|-------|------|
| Panel | `frontend/components/codeInterpreter/CodeInterpreterPanel.tsx` |
| Editor | Prism-highlighted Python editor + ⌘/Ctrl+Enter run |
| Hook | `frontend/hooks/useCodeInterpreter.ts` |
| API client | `frontend/lib/codeInterpreter/` |
| Entry | Header **Code** button → side panel |

Panel includes: code editor, Run/Stop, upload, output tab, charts preview/download, generated files list, progress bar, restart/close session, **Canvas** publish for charts.

---

## Integrations

### AI Agents

- Model tool: `code_execution` (no longer `future`)
- Agent adapter registered; available to `general`, `coding`, `research`, `data_analysis`
- Optional `publishCanvas` arg to push charts into Canvas

### Deep Research

- `services/research/codeAnalysis.js` runs a quantitative score summary during the **verifying** phase when the interpreter is enabled
- Emits `code_analysis` SSE events + timeline entry

### Canvas

- `POST /sessions/:id/publish-canvas` and tool `publishCanvas`
- Creates a markdown Canvas draft with chart image URL + stdout excerpt

---

## Resource defaults

| Limit | Env | Default |
|-------|-----|---------|
| CPU seconds | `VANI_CI_CPU_SECONDS` | 30 |
| Memory | `VANI_CI_MEMORY_MB` | 512 |
| Disk | `VANI_CI_DISK_MB` | 256 |
| Timeout | `VANI_CI_TIMEOUT_MS` | 30000 |
| Sessions / user | `VANI_CI_MAX_SESSIONS_PER_USER` | 3 |
| Idle TTL | `VANI_CI_IDLE_TTL_MS` | 15 min |
| Session TTL | `VANI_CI_SESSION_TTL_MS` | 60 min |

Workspace root: `VANI_CODE_INTERPRETER_DIR` or `backend/.code-interpreter/` (gitignored).

---

## Ops

### Local

```bash
# Install Python deps (once)
pip3 install -r backend/requirements-code-interpreter.txt

# Enable
echo 'VANI_ENABLE_CODE_EXECUTION=true' >> backend/.env

# Verify
cd backend && npm run verify:code
```

### Docker

Backend image installs Python 3 + `requirements-code-interpreter.txt` when  
`INSTALL_CODE_INTERPRETER=true` (default). Disable with:

```bash
docker build --build-arg INSTALL_CODE_INTERPRETER=false …
```

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` / `lint` (backend) | Syntax check including new TS modules |
| `npm run verify:code` | Health + optional smoke execute |
| Frontend `npm run build` | Next production build (passed) |

---

## Verification performed

- Backend `npm run build` / `npm run lint` — **225 files OK**
- Frontend lint on Code Interpreter paths — **clean**
- Frontend `npm run build` — **success**
- Unit tests added: `backend/tests/unit/codeInterpreter.test.js`

---

## Follow-ups (optional hardening)

1. Stronger isolation via gVisor / Firecracker / dedicated worker containers for multi-tenant production.
2. Persist session metadata in Mongo for multi-instance sticky routing.
3. Quotas per org / billing metering for execution minutes.
4. Optional Monaco editor if denser editing UX is desired.
5. Broader e2e Playwright coverage for the Code panel journey.
