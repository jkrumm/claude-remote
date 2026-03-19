.PHONY: deploy restart restart-api restart-watchdog restart-vibekanban build-agent \
        logs logs-api logs-vibekanban ps status trigger-evening trigger-morning trigger-hourly help

SSH     = ssh cr
REPO    = ~/SourceRoot/claude-remote
COMPOSE = docker compose -f $(REPO)/docker/docker-compose.yml
DOPPLER = doppler run -p claude-remote -c prod --
DB      = ~/watchdog-data/store/messages.db
INSTRUCTIONS_SRC  = $(REPO)/watchdog/groups/instructions/telegram_main.md
INSTRUCTIONS_DEST = ~/watchdog-data/groups/instructions/telegram_main.md
INFRA_TASKS = 'monitoring-hourly','monitoring-morning','monitoring-evening'

# ── Full stack ─────────────────────────────────────────────────────────────────

deploy: ## Pull and rebuild everything including vibekanban — full cold deploy
	$(SSH) "cd $(REPO) && git pull"
	$(SSH) "cp $(INSTRUCTIONS_SRC) $(INSTRUCTIONS_DEST)"
	$(SSH) "sqlite3 $(DB) \"DELETE FROM scheduled_tasks WHERE id IN ($(INFRA_TASKS))\""
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) build --no-cache claude-remote-api watchdog"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) up -d"
	@echo "Waiting for API to seed tasks..."
	@sleep 8
	$(SSH) "sqlite3 $(DB) \"SELECT id, next_run FROM scheduled_tasks WHERE id LIKE 'monitoring-%'\""

# ── API + Watchdog (primary — use this for any code or prompt change) ──────────

restart: ## Pull, rebuild API + watchdog, sync instructions, reseed tasks — verify all
	$(SSH) "cd $(REPO) && git pull"
	$(SSH) "cp $(INSTRUCTIONS_SRC) $(INSTRUCTIONS_DEST)"
	$(SSH) "sqlite3 $(DB) \"DELETE FROM scheduled_tasks WHERE id IN ($(INFRA_TASKS))\""
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) build --no-cache claude-remote-api watchdog"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) up -d --no-deps claude-remote-api watchdog"
	@echo "Waiting for API to seed tasks..."
	@sleep 8
	$(SSH) "sqlite3 $(DB) \"SELECT id, next_run FROM scheduled_tasks WHERE id LIKE 'monitoring-%'\""
	$(SSH) "$(COMPOSE) ps claude-remote-api watchdog 2>/dev/null"

# ── Individual restarts (for precision — prefer `make restart` for most changes) ─

restart-api: ## Rebuild API only — reseed infra tasks, verify
	$(SSH) "cd $(REPO) && git pull"
	$(SSH) "sqlite3 $(DB) \"DELETE FROM scheduled_tasks WHERE id IN ($(INFRA_TASKS))\""
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) build --no-cache claude-remote-api"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) up -d --no-deps claude-remote-api"
	@echo "Waiting for API to seed tasks..."
	@sleep 6
	$(SSH) "sqlite3 $(DB) \"SELECT id, next_run FROM scheduled_tasks WHERE id LIKE 'monitoring-%'\""

restart-watchdog: ## Rebuild watchdog only — sync instructions, verify running
	$(SSH) "cd $(REPO) && git pull"
	$(SSH) "cp $(INSTRUCTIONS_SRC) $(INSTRUCTIONS_DEST)"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) build --no-cache watchdog"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) up -d --no-deps watchdog"
	$(SSH) "$(COMPOSE) ps watchdog 2>/dev/null"

# ── VibeKanban ─────────────────────────────────────────────────────────────────

restart-vibekanban: ## Pull vibekanban repo, rebuild, redeploy
	$(SSH) "cd ~/SourceRoot/vibe-kanban && git pull"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) build --no-cache vibekanban"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) up -d --no-deps vibekanban"
	$(SSH) "$(COMPOSE) ps vibekanban"

# ── Agent container ────────────────────────────────────────────────────────────

build-agent: ## Rebuild the agent container image used for spawned Claude agents
	$(SSH) "cd $(REPO)/watchdog && ./container/build.sh"

# ── Monitoring triggers ────────────────────────────────────────────────────────

trigger-evening: ## Trigger the evening report now
	@SECRET=$$(doppler secrets get CLAUDE_REMOTE_API_SECRET --plain -p claude-remote -c prod) && \
	  curl -s -X PATCH "https://claude-remote-api.jkrumm.com/tasks/monitoring-evening" \
	    -H "Authorization: Bearer $$SECRET" \
	    -H "Content-Type: application/json" \
	    -d "{\"next_run\": \"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" | jq '{id, next_run}'

trigger-morning: ## Trigger the morning digest now
	@SECRET=$$(doppler secrets get CLAUDE_REMOTE_API_SECRET --plain -p claude-remote -c prod) && \
	  curl -s -X PATCH "https://claude-remote-api.jkrumm.com/tasks/monitoring-morning" \
	    -H "Authorization: Bearer $$SECRET" \
	    -H "Content-Type: application/json" \
	    -d "{\"next_run\": \"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" | jq '{id, next_run}'

trigger-hourly: ## Trigger the hourly health check now
	@SECRET=$$(doppler secrets get CLAUDE_REMOTE_API_SECRET --plain -p claude-remote -c prod) && \
	  curl -s -X PATCH "https://claude-remote-api.jkrumm.com/tasks/monitoring-hourly" \
	    -H "Authorization: Bearer $$SECRET" \
	    -H "Content-Type: application/json" \
	    -d "{\"next_run\": \"$$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" | jq '{id, next_run}'

# ── Observability ──────────────────────────────────────────────────────────────

logs: ## Stream watchdog logs
	$(SSH) "$(COMPOSE) logs -f watchdog 2>/dev/null"

logs-api: ## Stream API logs
	$(SSH) "$(COMPOSE) logs -f claude-remote-api 2>/dev/null"

logs-vibekanban: ## Stream vibekanban logs
	$(SSH) "$(COMPOSE) logs -f vibekanban 2>/dev/null"

ps: ## Show all running services
	$(SSH) "$(COMPOSE) ps 2>/dev/null"

status: ## Rich status — containers, scheduled tasks, last runs
	@echo "=== Services ==="
	$(SSH) "$(COMPOSE) ps 2>/dev/null"
	@echo ""
	@echo "=== Scheduled tasks ==="
	$(SSH) "sqlite3 $(DB) \"SELECT id, status, next_run, last_run FROM scheduled_tasks ORDER BY id\""

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-22s %s\n", $$1, $$2}'
