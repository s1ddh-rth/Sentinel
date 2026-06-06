.PHONY: help setup run run-full stop logs test lint data train fairness graph-build rag-ingest clean

help:                   ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

setup:                  ## Create .env from the template
	cp -n .env.example .env || true

run:                    ## Build and start the core stack (traefik + frontend + predict + postgres)
	docker compose up -d --build

run-full:               ## Start the full stack including graph, agent, neo4j, qdrant, ollama, mlflow
	docker compose --profile full up -d --build

stop:                   ## Stop all services
	docker compose down

logs:                   ## Tail predict service logs
	docker compose logs -f predict

test:                   ## Run service tests
	cd services/predict && python -m pytest tests/ -v

lint:                   ## Lint and type-check
	ruff check services/ pipelines/ fairness/
	ruff format --check services/ pipelines/ fairness/
	mypy --strict services/ pipelines/ fairness/

data:                   ## Prepare the dataset (synthetic if the NIJ host is unreachable)
	python -m pipelines.data_prep

train:                  ## Train the model and write artifacts to models/
	python -m pipelines.train

fairness:               ## Print the fairness report from the latest training run
	python fairness/audit.py

graph-build:            ## Build the offender knowledge graph in Neo4j (Neo4j must be up)
	NEO4J_URL=bolt://localhost:7687 python -m pipelines.graph_build

rag-ingest:             ## (Re)ingest the domain-pack policy sources into Qdrant
	docker compose exec agent python -c "from app import retriever; print(retriever.ingest_domain_pack())"

clean:                  ## Stop services and remove generated data/artifacts
	docker compose down -v
	rm -rf data/raw/* data/processed/* models/*.pkl models/*.json mlruns/ *.parquet
