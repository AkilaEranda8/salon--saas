#!/bin/sh
# Inject REDIS_PASSWORD into ACL file at boot (C15).
set -e
PASS="${REDIS_PASSWORD:?REDIS_PASSWORD is required}"
ACL_SRC="/etc/redis/users.acl.template"
ACL_DST="/data/users.acl"
CONF_DST="/data/redis.conf"

# Strip CR (Windows checkouts) and comments; inject password without sed delimiter issues.
tr -d '\r' < "$ACL_SRC" | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$' \
  | awk -v p="$PASS" '{ gsub(/__REDIS_PASSWORD__/, p); print }' > "$ACL_DST"

cat > "$CONF_DST" <<EOF
bind 0.0.0.0
protected-mode yes
port 6379
appendonly yes
dir /data
aclfile /data/users.acl
EOF

exec redis-server "$CONF_DST"
