#!/bin/sh
# Inject REDIS_PASSWORD into ACL file at boot (C15).
set -e
PASS="${REDIS_PASSWORD:?REDIS_PASSWORD is required}"
ACL_SRC="/etc/redis/users.acl.template"
ACL_DST="/data/users.acl"
CONF_DST="/data/redis.conf"

sed "s/__REDIS_PASSWORD__/${PASS}/g" "$ACL_SRC" > "$ACL_DST"
cat > "$CONF_DST" <<EOF
bind 0.0.0.0
protected-mode yes
port 6379
appendonly yes
dir /data
aclfile /data/users.acl
EOF

exec redis-server "$CONF_DST"
