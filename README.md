<div align="center">

# SENTINEL

**Secure, Ethical, and Navigable Tool for Intelligent Evaluation of Likelihood**

An open-source platform for **fairness-aware recidivism risk assessment** — combining calibrated
predictive modelling, knowledge-graph reasoning, and retrieval-augmented generation with first-class
fairness constraints and human-in-the-loop oversight.

</div>

---

## Why SENTINEL exists

Algorithmic risk assessment is already used across criminal justice systems, and it has a documented
history of encoding and amplifying bias (the COMPAS controversy being the best-known example). SENTINEL
is a reference implementation of how such a system *should* be built: every prediction is calibrated and
carries an uncertainty interval, every model is audited for fairness before it can ship, every output is
explainable, and **a human always makes the final decision**. Risk scores are advisory — never punitive.

SENTINEL targets the **NIJ Recidivism Forecasting Challenge** dataset (~26,000 Georgia parolees,
published by the U.S. National Institute of Justice). **Note on data:** the public NIJ host is
currently unreachable, so the pipeline trains on a **synthetic** dataset (~25,835 rows) that
reproduces the NIJ feature schema and an illustrative *proxy-mediated* demographic disparity (race is
excluded from the features yet leaks through correlated proxies — the canonical "unawareness is not
enough" failure). **Every metric in this project is computed on that synthetic data**, not on real
reoffence outcomes. The point is the methodology, not the numbers.

## What it does

**Implemented today**

- **Calibrated risk prediction** — a single XGBoost classifier, Platt-scaled on a held-out split, explained
  per prediction with **exact** TreeSHAP contributions and served behind a FastAPI service. A single tree
  model is a deliberate choice: it keeps the explanation faithful to the served score (a stacked ensemble's
  attributions would not decompose the final probability).
- **Fairness as a working gate** — race and gender are excluded from the feature set, yet a Fairlearn audit
  shows the unmitigated model still discriminates via proxy features (the "unawareness is not enough"
  failure). The pipeline then mitigates — Kamiran–Calders reweighing plus per-group decision thresholds —
  and re-audits. Four metrics per group (SPD, disparate impact, EOD, PED) with a before/after comparison,
  and a CI gate (SPD < 0.10, DI ∈ [0.80, 1.25], |EOD|, |PED| ≤ 0.10) that blocks releases breaching them.
- **Human-in-the-loop workflow** — case officers review predictions, override risk bands with mandatory
  reason codes, and every prediction and override lands in a Postgres-backed audit trail.
- **Authentication & RBAC** — JWT (access + refresh with rotation), bcrypt passwords, three roles,
  per-endpoint rate limits, env-driven CORS allowlist, and fail-loud secret checks in production.
- **Knowledge graph** (`services/graph`) — a Neo4j k-nearest-neighbour "similar offenders" graph with
  Louvain communities, PageRank and degree centrality precomputed by `pipelines/graph_build.py`, served
  via `GET /features/{id}` and `/neighborhood/{id}`.
- **RAG assistant** (`services/agent`) — a PydanticAI agent with **structured output** (never free-text
  parsed) and two tools: `policy_search` (dense retrieval over the domain pack via sentence-transformers +
  Qdrant) and `risk_lookup` (the predict model). LLM is Ollama `qwen2.5` or the Anthropic API, selected by
  env; retrieval and tools run independently of the LLM, and grounded answers require a capable model.
- **Institutional-grade UI** — a responsive React dashboard (Case Review, Cohorts, Fairness, Models,
  Assistant, Audit) designed for data-literate professionals making consequential decisions.

**On the roadmap** (see [§ Roadmap](#roadmap))

- **Hybrid retrieval** — add HyDE, BM25 sparse (Postgres `tsvector`), Neo4j graph traversal, RRF fusion and
  a cross-encoder reranker on top of the current dense retrieval, with inline citations in the UI.
- **OWL ontology** reasoning over the knowledge graph, and graph features fed back into model training.
- **Adaptive conformal intervals** — the served interval is split-conformal (~90% marginal coverage from
  held-out calibration residuals); score-adaptive / Mondrian conformal is a possible refinement.

## Architecture

A set of FastAPI microservices behind a Traefik gateway, with a React SPA served by nginx:

| Service | Port | Responsibility |
|---|---|---|
| `predict` | 8000 | Inference, exact TreeSHAP, calibration, fairness audit + mitigation, **auth (JWT + RBAC)**, audit/model data APIs |
| `agent` | 8001 | PydanticAI RAG assistant — dense retrieval (Qdrant) + risk/graph tools, structured output |
| `graph` | 8002 | Neo4j knowledge graph, Cypher, OWL reasoning, graph features |
| `frontend` | 80 | React SPA (nginx) |

Shared infrastructure: PostgreSQL, Qdrant, Neo4j, Ollama (local LLM + embeddings — all inference stays
local, air-gapped by design), MLflow.

A pluggable **domain-pack** architecture keeps the platform core domain-agnostic; the criminal-justice
pack lives under `domain_packs/criminal_justice/`.

## Quick start

```bash
cp .env.example .env          # configure secrets (set a real JWT_SECRET)
docker compose up -d          # start the stack
# open http://localhost  → log in with a demo account
```

Demo accounts (password `sentinel-demo-2026`): `admin`, `analyst`, `officer` (`analyst` is read-only).

To produce a real trained model before starting the stack (otherwise the predict service runs a
transparent heuristic fallback):

```bash
python -m pipelines.data_prep   # data/processed/offenders.parquet (synthetic if the NIJ host is down)
python -m pipelines.train       # models/model.pkl + metrics.json + fairness.json
```

**Sharing a live demo:** expose the local stack on a public URL with a Cloudflare Tunnel — no port
forwarding, free TLS. See [`docs/deployment.md`](./docs/deployment.md).

See the [`Makefile`](./Makefile) for `make run`, `make test`, `make lint`, `make data`, and `make train`,
and [`docs/deployment.md`](./docs/deployment.md) / [`docs/api_contract.md`](./docs/api_contract.md).

## Roadmap

The platform core, the prediction + fairness + audit loop, and the graph and RAG services are built.
Next, in order:

1. **Hybrid retrieval** — HyDE, BM25 sparse, graph traversal, RRF fusion and a cross-encoder reranker
   layered onto the agent's current dense retrieval, with inline citations rendered in the Assistant UI.
2. **RAGAS evaluation** of the assistant (faithfulness, context precision) over a golden Q&A set.
3. **Graph features in training** — feed PageRank/community features from `services/graph` into the model.
4. **MLflow tracking** and model-card generation wired into the Models page.

## Tech stack

Python 3.11 · FastAPI · PydanticAI · XGBoost · scikit-learn · SHAP · Fairlearn ·
Neo4j · Qdrant · Ollama · sentence-transformers · PostgreSQL · MLflow · React 18 + Vite + Tailwind ·
Traefik · Docker Compose.

## License

[Apache License 2.0](./LICENSE).
