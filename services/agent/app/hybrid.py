"""Hybrid retrieval: dense + sparse + HyDE, fused with RRF, expanded by graph traversal, reranked.

Pipeline for one query:
  1. Dense — Qdrant vector search (sentence-transformers embeddings).
  2. Sparse — BM25 over the same chunk corpus (lexical recall the dense leg misses).
  3. HyDE — the LLM writes a hypothetical answer; its embedding is dense-searched (best-effort).
  4. RRF — reciprocal-rank fusion of the above rankings into one candidate list.
  5. Graph traversal — 1-hop expansion over a chunk-similarity graph to pull in related context.
  6. Rerank — a cross-encoder (ms-marco-MiniLM) rescores the candidates against the query.

Everything except HyDE works without an LLM. The corpus is small, so indices live in memory.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np
import structlog

from . import retriever
from .config import settings

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder

log = structlog.get_logger()
_TOKEN = re.compile(r"[a-z0-9]+")
_CROSS_ENCODER = "cross-encoder/ms-marco-MiniLM-L-6-v2"


def _tok(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


class _Index:
    """In-memory BM25 + embeddings + chunk-similarity graph over the domain-pack chunks."""

    def __init__(self) -> None:
        self.texts: list[str] = []
        self.sources: list[str] = []
        self.text2i: dict[str, int] = {}
        self.bm25: Any = None
        self.knn: list[list[int]] = []
        self._ce: CrossEncoder | None = None

    @property
    def ready(self) -> bool:
        return bool(self.texts)

    def build(self) -> None:
        from rank_bm25 import BM25Okapi  # noqa: PLC0415

        pack_dir = Path("domain_packs") / settings.domain_pack / "rag_sources"
        chunks: list[tuple[str, str]] = []
        for path in sorted(pack_dir.glob("*.md")):
            for chunk in retriever._chunks(path.read_text(encoding="utf-8")):
                chunks.append((chunk, path.stem))
        self.texts = [c for c, _ in chunks]
        self.sources = [s for _, s in chunks]
        self.text2i = {t: i for i, t in enumerate(self.texts)}
        self.bm25 = BM25Okapi([_tok(t) for t in self.texts])

        # Chunk-similarity graph (cosine via dot product on normalised embeddings) for traversal.
        emb = np.asarray(retriever._embed(self.texts))
        sims = emb @ emb.T
        np.fill_diagonal(sims, -1.0)
        self.knn = [list(np.argsort(row)[::-1][:3]) for row in sims]
        log.info("hybrid.index.built", chunks=len(self.texts))

    def cross_encoder(self) -> CrossEncoder:
        if self._ce is None:
            from sentence_transformers import CrossEncoder  # noqa: PLC0415

            self._ce = CrossEncoder(_CROSS_ENCODER)
            log.info("hybrid.reranker.loaded", model=_CROSS_ENCODER)
        return self._ce


_index = _Index()


def _ensure() -> _Index:
    if not _index.ready:
        _index.build()
    return _index


def _rrf(rankings: list[list[int]], k: int = 60) -> list[int]:
    """Reciprocal-rank fusion: sum 1/(k + rank) across the input rankings."""
    scores: dict[int, float] = {}
    for ranking in rankings:
        for rank, idx in enumerate(ranking):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=lambda i: scores[i], reverse=True)


def _dense(query: str, n: int) -> list[int]:
    """Dense leg via Qdrant; map hits back to corpus indices by chunk text."""
    hits = retriever.search(query, k=n)
    return [_index.text2i[h["snippet"]] for h in hits if h["snippet"] in _index.text2i]


def _sparse(query: str, n: int) -> list[int]:
    scores = _index.bm25.get_scores(_tok(query))
    return [int(i) for i in np.argsort(scores)[::-1][:n]]


def _hyde(query: str, n: int) -> list[int]:
    """HyDE: dense-search a hypothetical answer from the LLM. No-op if the LLM is unavailable."""
    from .llm import generate  # noqa: PLC0415

    doc = generate(f"Write a short, factual policy passage that answers: {query}")
    return _dense(doc, n) if doc else []


def _graph_expand(seed: list[int]) -> list[int]:
    """1-hop expansion over the chunk-similarity graph, preserving order and de-duplicating."""
    out = list(seed)
    for i in seed:
        for j in _index.knn[i]:
            if j not in out:
                out.append(j)
    return out


def hybrid_search(query: str, k: int | None = None, use_hyde: bool = True) -> list[dict[str, Any]]:
    """Run the full hybrid pipeline and return the top-k chunks as {source, snippet, score}."""
    idx = _ensure()
    k = k or settings.rag_top_k
    n = max(8, k * 3)

    rankings = [_dense(query, n), _sparse(query, n)]
    if use_hyde:
        hyde = _hyde(query, n)
        if hyde:
            rankings.append(hyde)

    fused = _rrf(rankings)
    candidates = _graph_expand(fused[: max(k, 4)])[:n]
    if not candidates:
        return []

    scores = idx.cross_encoder().predict([(query, idx.texts[i]) for i in candidates])
    ranked = sorted(zip(candidates, scores, strict=True), key=lambda t: float(t[1]), reverse=True)
    return [
        {"source": idx.sources[i], "snippet": idx.texts[i], "score": round(float(s), 3)}
        for i, s in ranked[:k]
    ]
