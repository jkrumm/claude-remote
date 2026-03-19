#!/bin/sh
set -e

# Ensure data directories exist (bind mount may be empty on fresh start)
mkdir -p /data/store /data/groups /data/sessions /data/env /data/ipc /data/logs

exec node dist/index.js
