#!/usr/bin/env bash
# Nightly backup of DB + photos. Cron (host): 0 2 * * * /opt/atlas/scripts/backup.sh
set -euo pipefail
cd /opt/atlas
STAMP=$(date +%F-%H%M)
DIR=/opt/atlas/backups
mkdir -p "$DIR"

# Consistent online DB snapshot (safe while the app runs)
docker compose exec -T app sqlite3 /data/atlas.db ".backup '/data/backup.db'"
docker compose cp app:/data/backup.db "$DIR/atlas-$STAMP.db"
docker compose exec -T app rm /data/backup.db
gzip "$DIR/atlas-$STAMP.db"

# Photos (uploads live on the volume, not in the DB)
docker compose exec -T app tar -C /data -cf - vehicle-photos furniture-photos social-posts 2>/dev/null \
  | gzip > "$DIR/photos-$STAMP.tar.gz" || true

# Optional offsite copy (rclone remote e.g. "r2"):
# rclone copy "$DIR" r2:atlas-backups/ --include "*-$STAMP.*"

find "$DIR" -name 'atlas-*.db.gz' -mtime +14 -delete
find "$DIR" -name 'photos-*.tar.gz' -mtime +14 -delete
