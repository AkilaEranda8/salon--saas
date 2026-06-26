#!/usr/bin/env python3
import json
import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '/root/xanesalon'
sa_path = os.path.join(root, 'firebase-sa.json')
env_path = os.path.join(root, '.env')

with open(sa_path, encoding='utf-8') as f:
    sa = json.dumps(json.load(f), separators=(',', ':'))

lines = []
if os.path.exists(env_path):
    with open(env_path, encoding='utf-8') as f:
        lines = f.read().splitlines()
lines = [l for l in lines if not l.startswith('FIREBASE_SERVICE_ACCOUNT_JSON=')]
lines.append('FIREBASE_SERVICE_ACCOUNT_JSON=' + sa)
with open(env_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')
print('FIREBASE_SERVICE_ACCOUNT_JSON written to .env')
