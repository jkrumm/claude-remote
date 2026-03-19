.PHONY: deploy build-watchdog build-agent logs restart ps

COMPOSE   = docker compose -f docker/docker-compose.yml
DOPPLER   = doppler run -p claude-remote -c prod --

deploy: ## Build and deploy all services with Doppler secrets
	$(DOPPLER) $(COMPOSE) up -d

build-watchdog: ## Rebuild watchdog image only
	$(DOPPLER) $(COMPOSE) build watchdog

build-agent: ## Rebuild agent container image (on server)
	cd watchdog && ./container/build.sh

logs: ## Follow watchdog logs
	$(COMPOSE) logs -f watchdog

restart: ## Restart watchdog container
	$(COMPOSE) restart watchdog

restart-api: ## Rebuild and redeploy API container (re-seeds infra tasks on startup)
	$(DOPPLER) $(COMPOSE) build --no-cache claude-remote-api
	$(DOPPLER) $(COMPOSE) up -d --no-deps claude-remote-api

ps: ## Show all running services
	$(COMPOSE) ps
