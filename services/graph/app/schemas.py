"""Response schemas for the graph service."""

from __future__ import annotations

from pydantic import BaseModel


class GraphFeatures(BaseModel):
    """Per-offender graph-derived features, suitable for use by the model and the case view."""

    offender_id: str
    in_graph: bool
    degree: int = 0
    pagerank: float = 0.0
    community: int = -1
    community_size: int = 0
    similar_ids: list[str] = []


class GraphNode(BaseModel):
    id: str
    label: str
    type: str


class GraphEdge(BaseModel):
    source: str
    target: str
    label: str


class Neighborhood(BaseModel):
    offender_id: str
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
