#!/usr/bin/env python3
"""
Product catalogue lookup for the BOM Analyzer UI.

Loads the scraped Manatec catalogue (data/catalog_manatec.json) and lets the
backend attach the real product name, image, category and price to BOM analysis
results. Matching is fuzzy, so a master-BOM name like "WBVL65 DSP Computerized
Wheel Balancer" resolves to its catalogue card even with minor wording drift.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_CATALOG = Path(__file__).resolve().parent / "data" / "catalog_manatec.json"

_STOP = {
    "the", "a", "an", "with", "for", "and", "of", "lux", "plus", "premium",
    "model", "type", "machine", "made", "india", "computerized", "computerised",
    "fully", "automatic", "semi", "wheel", "car", "cars", "2", "3d",
}

_BRAND_TOKENS = {"manatec"}


def _tokens(name: str) -> set[str]:
    words = re.findall(r"[a-z0-9]{2,}", name.lower())
    return {w for w in words if w not in _STOP}


def _brand_clean(name: str) -> list[str]:
    """Tokenise a name, dropping brand noise like 'manatec 3d …'."""
    toks = _tokens(name)
    return [t for t in toks if t not in _BRAND_TOKENS]


@lru_cache(maxsize=1)
def load_catalog() -> list[dict]:
    if not _CATALOG.exists():
        return []
    return json.loads(_CATALOG.read_text(encoding="utf-8"))


def lookup_product(query: str, threshold: float = 0.35) -> dict | None:
    """Return the best-matching catalogue product card for a BOM product name.

    Matching: weighted Jaccard over meaningful tokens. Returns None if no card
    clears the threshold.
    """
    q = set(_brand_clean(query))
    if not q:
        return None
    best: dict | None = None
    best_score = 0.0
    for card in load_catalog():
        c = set(_brand_clean(card["name"]))
        if not c:
            continue
        inter = q & c
        union = q | c
        score = len(inter) / len(union)
        # Boost exact / near-exact matches.
        if inter == q and inter == c:
            score = 1.0
        elif inter == q and len(c) <= len(q):
            score = max(score, 0.9)
        if score > best_score:
            best_score = score
            best = card
    if best_score >= threshold:
        return best
    return None


def enrich(product_name: str) -> dict:
    """catalogue metadata to merge into an analysis result (empty when unmatched)."""
    card = lookup_product(product_name)
    if not card:
        return {"catalog_image": "", "catalog_category": "", "catalog_price": ""}
    return {
        "catalog_image": card.get("image", ""),
        "catalog_category": card.get("category", ""),
        "catalog_price": card.get("price_raw", ""),
    }