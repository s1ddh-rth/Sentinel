# SENTINEL API contract (frontend ⇄ predict service)

The frontend talks to the backend through Traefik at base URL **`/api`** (Traefik strips `/api`
before forwarding to the `predict` service, so service-side routes have no `/api` prefix).

All shapes below mirror the design prototype's `mock-data.js` so the React pages map 1:1. The frontend
should fall back to bundled mock data if a call fails, so the UI is always populated for the demo.

## Auth (no JWT required)

```
POST /api/auth/signup   body {email, username, password, full_name}
POST /api/auth/login     body {username, password}
   → 200 {access_token, refresh_token, token_type:"bearer", user:{id, username, email, full_name, role}}
POST /api/auth/refresh   body {refresh_token}
   → 200 {access_token, refresh_token, token_type:"bearer", user} — ROTATES: the presented refresh
     token is consumed and a fresh pair issued; reusing the old token returns 401 (reuse detection).
GET  /api/auth/me        (Bearer) → {id, username, email, full_name, role}
POST /api/auth/logout    (Bearer) → {ok:true}
```

Demo users (password `sentinel-demo-2026`): `admin` (role admin), `analyst` (analyst), `officer` (case_officer).

## Data (Bearer required; 401 ⇒ frontend redirects to /login)

```
GET  /api/health → {status:"ok", model_version, mode("trained"|"heuristic")}

GET  /api/offenders            → {items:[Offender], total:int}
       Offender: {id, score, band(LOW|MEDIUM|HIGH), offence, region, age, race,
                  gender(M|F), lastAssessed("YYYY-MM-DD"), priorOffences, overridden(bool)}

GET  /api/offenders/{id}       → {offender:Offender, shap:[{feature,value,contribution}],
                                  similar:[{id,band,similarity,outcome,outcomeText,shared:[str]}],
                                  graph:{nodes:[{id,label,type(offender|offence|condition|area),x,y}],
                                         edges:[{from,to,label}]},
                                  detailedFactors:[{name,val,contrib,avg}],
                                  ci:[lower,upper], modelVersion, percentile}
       Notes: `ci` is the split-conformal interval (~90% coverage) and brackets `score`; `percentile`
       is the offender's rank in the cohort. Only predictions from the current model_version surface.

POST /api/predict              body {offender_id, features:{}, include_explanation:bool}
                               → {prediction_id, offender_id, risk_score, risk_band,
                                  confidence_interval:[lo,hi], shap_values:[{feature,value,contribution}],
                                  model_version, timestamp}
       `confidence_interval` is a split-conformal interval (~90% marginal coverage), not a tight CI.
       `risk_band` HIGH cut is calibrated per race group (demographic parity); the score is race-blind.

POST /api/override             body {offender_id, prediction_id?, original_band, new_band,
                                  reason_code, reason_text} → {ok:true, id}

GET  /api/audit                → {items:[{id, ts("YYYY-MM-DD HH:MM:SS"), action(prediction|override|
                                  feedback|promotion), offender, user, details, model}]}

GET  /api/fairness/metrics     → {current:[{name,full,value,baseline,threshold,pass,direction(abs|range)}]}
       `baseline` is the unmitigated value (before mitigation) for the before/after comparison.
GET  /api/fairness/history     → {timeseries:[{date,SPD,DI,EOD,PED}],
                                  comparison:[{group,unconstrained,debiased}]}

GET  /api/models/performance   → {brier, auc, aucpr,
                                  calibration:[{predicted,actual}], roc:[{fpr,tpr,baseline}],
                                  mlflow:[{runId,date,brier,auc,spd,di,status}]}
       brier/auc/aucpr/calibration/roc/mlflow are all from the real training run. (RAGAS quality
       metrics are NOT served — assistant evaluation is on the roadmap, never fabricated.)

GET  /api/reference            → {offenceTypes:[str], regions:[str], races:[str], reasonCodes:[str]}
```

## Agent (`agent` service, routed at `/api/agent`; needs a connected LLM)

The agent uses **structured output** (PydanticAI `output_type`) — never free-text parsed.

```
POST /api/agent/chat   body {session_id?, offender_id?, message}
   → 200 {answer, citations:[{source, snippet, score}], risk_context?:{offender_id, risk_score, risk_band}}
   → 503 {detail} when no LLM provider is connected (Ollama qwen2.5 / Anthropic). Retrieval and the
         risk/graph tools run independently; only answer generation needs the LLM.
```

## Graph (`graph` service, routed at `/api/graph`)

```
GET  /api/graph/features/{id}      → {offender_id, in_graph, degree, pagerank, community,
                                      community_size, similar_ids:[str]}
GET  /api/graph/neighborhood/{id}  → {offender_id, nodes:[{id,label,type}], edges:[{source,target,label}]}
```
