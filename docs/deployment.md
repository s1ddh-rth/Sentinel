# Deployment

SENTINEL is a Docker Compose stack. This document covers two scenarios: running it locally, and
exposing it on a public URL for reviewers via a Cloudflare Tunnel (the recommended way to give a
remote person access without opening ports or provisioning a cloud host).

---

## 1. Local

```bash
cp .env.example .env          # set a real JWT_SECRET (any 64-char hex string)
docker compose up -d --build  # traefik + frontend + predict + postgres
# open http://localhost  →  log in with a demo account
```

Everything routes through Traefik on port 80:

| Path        | Service  |
|-------------|----------|
| `/`         | frontend |
| `/api/*`    | predict  |

The trained model in `models/` is mounted read-only into the predict container at `/app/models`.
If that directory is empty the service degrades to a transparent logistic heuristic — the API shape
is identical, so the dashboard works either way. To produce real artifacts:

```bash
python -m pipelines.data_prep   # writes data/processed/offenders.parquet (synthetic if NIJ host is down)
python -m pipelines.train       # writes models/model.pkl, pipeline.pkl, metrics.json, fairness.json
docker compose up -d --build predict
```

---

## 2. Public access for reviewers — Cloudflare Tunnel

The platform sits behind JWT auth, so reviewers need (a) a reachable URL and (b) credentials.
Credentials are the three seeded demo accounts, printed on the login screen:

> `admin` / `analyst` / `officer` — password `sentinel-demo-2026`

(`admin` and `officer` can override predictions; `analyst` is read-only by design.)

For the URL, a Cloudflare Tunnel exposes the local stack on a subdomain with free TLS and **no port
forwarding**. Run this on the host where the stack is up (e.g. the Fedora server):

```bash
# one-time
cloudflared tunnel login
cloudflared tunnel create sentinel
cloudflared tunnel route dns sentinel sentinel.<your-domain>

# point the tunnel at Traefik (port 80) and run it
cloudflared tunnel --url http://localhost:80 run sentinel
```

`https://sentinel.<your-domain>` now serves the full app. Because all `/api/*` calls are same-origin
through Traefik, no CORS or backend-URL configuration is needed on the frontend.

For an always-on deployment, install `cloudflared` as a systemd service:

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

### Hardening before sharing the link
- Set `ENVIRONMENT=production` and a strong `JWT_SECRET` in `.env` — in production the predict
  service refuses to start on an insecure/unset secret (fail-loud).
- Set `CORS_ORIGINS=https://sentinel.<your-domain>` so the API's CORS allowlist matches the tunnel
  origin (the frontend is same-origin through Traefik, so this is belt-and-suspenders).
- Change `DEMO_PASSWORD` if the link will be public for a while.
- Consider Cloudflare Access (email OTP) in front of the subdomain for an extra gate.

---

## 3. Full stack (graph + RAG assistant)

`make run-full` (or `docker compose --profile full up -d --build`) additionally starts the **graph**
and **agent** services plus Neo4j, Qdrant, Ollama and MLflow. Both services are built and route
through Traefik at `/api/graph` and `/api/agent`.

```bash
make run-full
python -m pipelines.graph_build   # build the knowledge graph in Neo4j (Neo4j must be up)
```

**LLM for the assistant.** The agent selects its model by `AGENT_LLM_PROVIDER`:
- `ollama` (default) — point `OLLAMA_MODEL` at a capable model your Ollama serves (e.g. `qwen2.5`).
  This is the intended path on the Fedora box, which already runs Ollama.
- `anthropic` — set `AGENT_LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. Offloads generation to
  the API so the host stays light.

Retrieval and the risk/graph tools run **without** an LLM; only answer generation needs one. With no
capable model connected, `/api/agent/chat` returns a 503 and the Assistant UI shows an honest
"offline" message rather than fabricating an answer.
