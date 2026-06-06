"""Build the SENTINEL offender knowledge graph in Neo4j.

Constructs a k-nearest-neighbour "similar offenders" graph over the standardised feature space, then
precomputes the graph features the platform uses — Louvain community, PageRank and degree centrality
— and writes offender nodes + ``:SIMILAR_TO`` edges to Neo4j. The graph service reads these back via
``GET /features/{id}`` and ``/neighborhood/{id}``.

Run (Neo4j must be up — ``docker compose --profile full up -d neo4j``):
    NEO4J_URL=bolt://localhost:7687 python -m pipelines.graph_build
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pandas as pd

DATA = Path("data/processed/offenders.parquet")
NEO4J_URL = os.environ.get("NEO4J_URL", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "sentinel")

# A bounded sample keeps the graph tractable for the community demo (full 26k is unnecessary here).
SAMPLE = int(os.environ.get("GRAPH_SAMPLE", "1500"))
K = 6  # nearest neighbours per offender

NUMERIC = [
    "Age_at_Release",
    "Prior_Arrest_Episodes_Violent",
    "Prior_Arrest_Episodes_Property",
    "Prior_Arrest_Episodes_Drug",
    "Prior_Conviction_Episodes_Felony",
    "Percent_Days_Employed",
    "DrugTests_THC_Positive",
    "Gang_Affiliated",
]


def _load() -> pd.DataFrame:
    if not DATA.exists():
        print("[graph_build] no parquet — running data_prep first")
        from pipelines import data_prep  # noqa: PLC0415

        data_prep.main()
    df = pd.read_parquet(DATA)
    df["Gang_Affiliated"] = df["Gang_Affiliated"].astype(int)
    if len(df) > SAMPLE:
        df = df.sample(SAMPLE, random_state=42).reset_index(drop=True)
    print(f"[graph_build] loaded {len(df)} offenders")
    return df


def _build_graph(df: pd.DataFrame):
    import networkx as nx  # noqa: PLC0415
    from sklearn.neighbors import NearestNeighbors  # noqa: PLC0415
    from sklearn.preprocessing import StandardScaler  # noqa: PLC0415

    x = StandardScaler().fit_transform(df[NUMERIC].astype(float).to_numpy())
    nn = NearestNeighbors(n_neighbors=K + 1).fit(x)
    _, idx = nn.kneighbors(x)

    ids = df["ID"].tolist()
    g = nx.Graph()
    g.add_nodes_from(ids)
    for i, neighbours in enumerate(idx):
        for j in neighbours[1:]:  # skip self (first neighbour)
            g.add_edge(ids[i], ids[int(j)])
    print(f"[graph_build] kNN graph: {g.number_of_nodes()} nodes, {g.number_of_edges()} edges")
    return g


def _features(g) -> tuple[dict, dict, dict]:
    import networkx as nx  # noqa: PLC0415

    pagerank = nx.pagerank(g)
    degree = dict(g.degree())
    communities = nx.community.louvain_communities(g, seed=42)
    community_of: dict[str, int] = {}
    for c, members in enumerate(communities):
        for m in members:
            community_of[m] = c
    print(f"[graph_build] {len(communities)} Louvain communities")
    return pagerank, degree, community_of


def _write_neo4j(df: pd.DataFrame, g, pagerank: dict, degree: dict, community: dict) -> None:
    from neo4j import GraphDatabase  # noqa: PLC0415

    nodes = [
        {
            "id": row["ID"],
            "race": row["Race"],
            "gender": row["Gender"],
            "age": int(row["Age_at_Release"]),
            "recid": int(row["Recidivism_Within_3years"]),
            "pr": float(pagerank[row["ID"]]),
            "deg": int(degree[row["ID"]]),
            "comm": int(community[row["ID"]]),
        }
        for _, row in df.iterrows()
    ]
    edges = [{"a": a, "b": b} for a, b in g.edges()]

    driver = GraphDatabase.driver(NEO4J_URL, auth=(NEO4J_USER, NEO4J_PASSWORD))
    with driver.session() as session:
        session.run("CREATE INDEX offender_id IF NOT EXISTS FOR (o:Offender) ON (o.id)")
        session.run("MATCH (o:Offender) DETACH DELETE o")  # idempotent full rebuild
        session.run(
            """UNWIND $rows AS r
               MERGE (o:Offender {id: r.id})
               SET o.race = r.race, o.gender = r.gender, o.age = r.age, o.recid = r.recid,
                   o.pagerank = r.pr, o.degree = r.deg, o.community = r.comm""",
            rows=nodes,
        )
        session.run(
            """UNWIND $edges AS e
               MATCH (x:Offender {id: e.a}), (y:Offender {id: e.b})
               MERGE (x)-[:SIMILAR_TO]-(y)""",
            edges=edges,
        )
    driver.close()
    print(f"[graph_build] wrote {len(nodes)} nodes + {len(edges)} edges to {NEO4J_URL}")


def main() -> None:
    df = _load()
    g = _build_graph(df)
    pagerank, degree, community = _features(g)
    _write_neo4j(df, g, pagerank, degree, community)
    print("[graph_build] done")


if __name__ == "__main__":
    sys.exit(main())  # type: ignore[func-returns-value]
