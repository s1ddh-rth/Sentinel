"""Dense retrieval over the domain pack's policy sources, backed by Qdrant.

Embeddings use ``sentence-transformers/all-MiniLM-L6-v2`` on CPU (local, free). Sources live in
``domain_packs/<pack>/rag_sources/`` and are chunked by paragraph at ingest time. This is the
``policy_search`` tool's backend; HyDE, BM25 fusion and a cross-encoder reranker are future work.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog

from .config import settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

log = structlog.get_logger()
_VECTOR_SIZE = 384  # all-MiniLM-L6-v2
_embedder: SentenceTransformer | None = None


def _model() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer  # noqa: PLC0415

        _embedder = SentenceTransformer(settings.embed_model)
        log.info("retriever.embedder.loaded", model=settings.embed_model)
    return _embedder


def _client() -> Any:
    from qdrant_client import QdrantClient  # noqa: PLC0415

    return QdrantClient(url=settings.qdrant_url)


def _embed(texts: list[str]) -> list[list[float]]:
    vecs = _model().encode(texts, normalize_embeddings=True)
    return [v.tolist() for v in vecs]


def _chunks(text: str) -> list[str]:
    """Split a document into paragraph chunks, dropping headers-only and tiny fragments."""
    out: list[str] = []
    for block in text.split("\n\n"):
        block = block.strip()
        if len(block) >= 40:  # skip bare headings / one-liners
            out.append(block)
    return out


def _pack_dir() -> Path:
    return Path("domain_packs") / settings.domain_pack / "rag_sources"


def ingest_domain_pack(pack: str | None = None) -> int:
    """Embed and upsert every source chunk for the pack into Qdrant. Returns the chunk count."""
    from qdrant_client import models  # noqa: PLC0415

    if pack:
        settings.domain_pack = pack
    client = _client()
    client.recreate_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=models.VectorParams(size=_VECTOR_SIZE, distance=models.Distance.COSINE),
    )
    points: list[Any] = []
    for path in sorted(_pack_dir().glob("*.md")):
        for chunk in _chunks(path.read_text(encoding="utf-8")):
            pid = int(hashlib.sha1(f"{path.name}:{chunk}".encode()).hexdigest()[:15], 16)
            points.append((pid, chunk, path.stem))
    if not points:
        log.warning("retriever.ingest.empty", dir=str(_pack_dir()))
        return 0
    vectors = _embed([c for _, c, _ in points])
    client.upsert(
        collection_name=settings.qdrant_collection,
        points=[
            models.PointStruct(id=pid, vector=vec, payload={"text": chunk, "source": source})
            for (pid, chunk, source), vec in zip(points, vectors, strict=True)
        ],
    )
    log.info("retriever.ingest.done", chunks=len(points))
    return len(points)


def ensure_ingested() -> int:
    """Ingest sources if the collection is missing or empty. Returns the collection size."""
    client = _client()
    try:
        info = client.get_collection(settings.qdrant_collection)
        if info.points_count and info.points_count > 0:
            return int(info.points_count)
    except Exception:  # noqa: BLE001 - collection absent → ingest below
        pass
    return ingest_domain_pack()


def search(query: str, k: int | None = None) -> list[dict[str, Any]]:
    """Return the top-k policy chunks for a query as {source, snippet, score}."""
    k = k or settings.rag_top_k
    vector = _embed([query])[0]
    result = _client().query_points(
        collection_name=settings.qdrant_collection, query=vector, limit=k
    )
    return [
        {
            "source": (h.payload or {}).get("source", "unknown"),
            "snippet": (h.payload or {}).get("text", ""),
            "score": float(h.score),
        }
        for h in result.points
    ]
