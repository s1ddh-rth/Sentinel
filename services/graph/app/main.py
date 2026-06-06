"""SENTINEL graph service — knowledge-graph features over the offender similarity graph.

The graph is built offline by ``pipelines.graph_build`` (a k-nearest-neighbour "similar offenders"
graph with Louvain communities, PageRank and degree centrality precomputed onto the nodes). This
service reads those features back out for the model pipeline and the case view. Routed at
``/api/graph`` by Traefik in the full-profile stack.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI

from . import graph
from .schemas import GraphEdge, GraphFeatures, GraphNode, Neighborhood

structlog.configure(
    processors=[structlog.processors.add_log_level, structlog.processors.JSONRenderer()],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    log.info("graph.startup")
    yield
    graph.close()


app = FastAPI(title="SENTINEL · graph", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "neo4j": "up" if graph.ping() else "down"}


@app.get("/features/{offender_id}", response_model=GraphFeatures)
def features(offender_id: str) -> GraphFeatures:
    """Graph-derived features for one offender. ``in_graph=False`` if the node is absent."""
    rows = graph.query(
        """
        MATCH (o:Offender {id: $id})
        OPTIONAL MATCH (peer:Offender {community: o.community})
        WITH o, count(peer) AS community_size
        OPTIONAL MATCH (o)-[:SIMILAR_TO]-(s:Offender)
        RETURN o.degree AS degree, o.pagerank AS pagerank, o.community AS community,
               community_size, collect(DISTINCT s.id)[..8] AS similar_ids
        """,
        id=offender_id,
    )
    if not rows or rows[0]["degree"] is None:
        return GraphFeatures(offender_id=offender_id, in_graph=False)
    r = rows[0]
    return GraphFeatures(
        offender_id=offender_id,
        in_graph=True,
        degree=int(r["degree"] or 0),
        pagerank=float(r["pagerank"] or 0.0),
        community=int(r["community"] if r["community"] is not None else -1),
        community_size=int(r["community_size"] or 0),
        similar_ids=list(r["similar_ids"] or []),
    )


@app.get("/neighborhood/{offender_id}", response_model=Neighborhood)
def neighborhood(offender_id: str) -> Neighborhood:
    """The offender plus its nearest neighbours, shaped for the case-view graph minimap."""
    rows = graph.query(
        """
        MATCH (o:Offender {id: $id})-[:SIMILAR_TO]-(s:Offender)
        RETURN o.id AS center, o.community AS community,
               collect(DISTINCT {id: s.id, community: s.community})[..6] AS neighbours
        """,
        id=offender_id,
    )
    if not rows:
        return Neighborhood(offender_id=offender_id)
    r = rows[0]
    nodes = [GraphNode(id=r["center"], label=r["center"], type="offender")]
    edges: list[GraphEdge] = []
    for n in r["neighbours"]:
        nodes.append(GraphNode(id=n["id"], label=n["id"], type="similar"))
        edges.append(GraphEdge(source=r["center"], target=n["id"], label="SIMILAR_TO"))
    return Neighborhood(offender_id=offender_id, nodes=nodes, edges=edges)
