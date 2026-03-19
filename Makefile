.PHONY: deploy restart-api restart-watchdog build-agent logs logs-api ps help

SSH    = ssh cr
REPO   = ~/SourceRoot/claude-remote
COMPOSE = docker compose -f $(REPO)/docker/docker-compose.yml
DOPPLER = doppler run -p claude-remote -c prod --
DB     = ~/watchdog-data/store/messages.db

# ── Full stack deploy ──────────────────────────────────────────────────────────

deploy: ## Pull latest code and redeploy all services with secrets
	$(SSH) "cd $(REPO) && git pull && $(DOPPLER) $(COMPOSE) up -d --build"

# ── API ────────────────────────────────────────────────────────────────────────

restart-api: ## Pull, rebuild API image, reseed infra tasks, redeploy
	$(SSH) "cd $(REPO) && git pull"
	$(SSH) "sqlite3 $(DB) \"DELETE FROM scheduled_tasks WHERE id IN ('monitoring-hourly','monitoring-morning','monitoring-evening')\""
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) build --no-cache claude-remote-api"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) up -d --no-deps claude-remote-api"
	@echo "Waiting for API to seed tasks..."
	@sleep 6
	$(SSH) "sqlite3 $(DB) \"SELECT id, next_run FROM scheduled_tasks WHERE id LIKE 'monitoring-%'\""

# ── Watchdog ───────────────────────────────────────────────────────────────────

restart-watchdog: ## Pull, sync agent instructions, restart watchdog container
	$(SSH) "cd $(REPO) && git pull"
	$(SSH) "cp $(REPO)/watchdog/groups/instructions/telegram_main.md ~/watchdog-data/groups/instructions/telegram_main.md"
	$(SSH) "cd $(REPO) && $(DOPPLER) $(COMPOSE) restart watchdog"

build-agent: ## Rebuild the agent container image used for spawned agents
	$(SSH) "cd $(REPO)/watchdog && ./container/build.sh"

# ── Observability ──────────────────────────────────────────────────────────────

logs: ## Follow watchdog logs
	$(SSH) "$(COMPOSE) logs -f watchdog"

logs-api: ## Follow API logs
	$(SSH) "$(COMPOSE) logs -f claude-remote-api"

ps: ## Show all running services
	$(SSH) "$(COMPOSE) ps"

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-20s %s\n", $$1, $$2}'
