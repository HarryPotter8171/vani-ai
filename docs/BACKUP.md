# MongoDB Backup & Restore

VANI AI stores chats, users, memory, files metadata, canvas, research, and
related documents in MongoDB. Treat Mongo as the system of record and back it
up before every production deploy and on a daily schedule.

Redis is used for rate limiting only — it is **not** required for restore of
user data. Uploaded file blobs live on the backend filesystem / volume
(`uploads/`); back those up alongside Mongo if you persist files to disk.

---

## Prerequisites

- `mongodump` / `mongorestore` from the [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/)
- Network access to the production `MONGODB_URI`
- Write access to durable backup storage (S3, GCS, encrypted disk, etc.)

For Docker Compose (local/self-hosted):

```bash
docker compose exec mongo mongosh --eval 'db.adminCommand({ ping: 1 })'
```

---

## Backup

### One-shot logical backup (recommended)

```bash
# From a machine that can reach Mongo. Prefer a read preference of secondary
# in replica-set production if available.
export MONGODB_URI='mongodb://USER:PASS@HOST:27017/vani-ai?authSource=admin'
export BACKUP_DIR="./backups/$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR" --gzip

# Optional: encrypt at rest before shipping off-box
# tar -czf - -C "$BACKUP_DIR" . | age -r "$AGE_RECIPIENT" > "${BACKUP_DIR}.tar.gz.age"
```

### Docker Compose helper

```bash
BACKUP_DIR="./backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
docker compose exec -T mongo mongodump --db=vani-ai --archive --gzip \
  > "${BACKUP_DIR}/vani-ai.archive.gz"
```

### What to capture every time

| Asset | Path / source | Notes |
|-------|---------------|-------|
| MongoDB logical dump | `mongodump` output | Required |
| Uploads volume | `backend/uploads` or Docker volume `backend-uploads` | Required if files are on disk |
| Env / secrets snapshot | Secret manager export (not git) | Needed to rehydrate the app |
| Release identity | `GET /version` JSON | Correlate backup with deploy |

### Schedule (production)

- **Daily** full logical dump, retain ≥ 14 days
- **Pre-deploy** dump immediately before each production release
- **Weekly** restore drill into a staging database (see below)

Store backups **off the primary host**. Encrypt at rest. Restrict IAM.

---

## Restore

> Restoring overwrites data in the target database. Always restore into a
> staging URI first when validating a backup.

### Restore a directory dump

```bash
export MONGODB_URI='mongodb://USER:PASS@HOST:27017/vani-ai?authSource=admin'
# Point at the dump folder that contains the `vani-ai` database directory.
mongorestore --uri="$MONGODB_URI" --gzip --drop "/path/to/backup/vani-ai"
```

`--drop` removes existing collections before restore so you get an exact
snapshot. Omit `--drop` only when intentionally merging (rarely correct).

### Restore a Docker archive

```bash
docker compose exec -T mongo mongorestore --db=vani-ai --drop --archive --gzip \
  < ./backups/YYYYMMDDTHHMMSSZ/vani-ai.archive.gz
```

### Restore uploads

```bash
# Example: copy a tarball of the uploads volume back into place
docker compose stop backend
# restore files into the `backend-uploads` volume or bind mount
docker compose start backend
```

### Post-restore verification

1. `GET /ready` → `200 { "status": "ready" }`
2. `GET /health` → Mongo check `healthy: true`
3. Sign in and open a known chat / project from before the backup
4. Confirm memory decryption still works (same `VANI_MEMORY_ENCRYPTION_KEY`)
5. Spot-check a file download if uploads were restored

---

## Point-in-time & managed Mongo

If you use **MongoDB Atlas** (or another managed offering):

- Enable continuous cloud backups / PITR
- Keep a documented restore runbook in your cloud console
- Still run an occasional `mongodump` export to a second cloud for
  vendor-independence

Memory content is encrypted with `VANI_MEMORY_ENCRYPTION_KEY`. Restoring a
dump without the matching key yields opaque ciphertext — back up that secret
in your secret manager alongside the dump.

---

## Rollback pairing

When rolling back an application deploy:

1. Confirm whether the bad release ran schema-incompatible writes
2. If yes → restore the pre-deploy Mongo dump (and uploads)
3. If no → app rollback alone is usually enough; keep the dump anyway

See [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md) for the full rollback plan.
