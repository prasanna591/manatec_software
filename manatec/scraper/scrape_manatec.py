#!/usr/bin/env python3
"""
Manatec Electronics product catalog scraper.

Fetches the public catalogue at https://www.manatec.net and extracts, for each
product: name, category, anchor/slug, price + unit, specification dictionary,
feature list and the primary product image URL.

Outputs:
    data/catalog_manatec.json   — structured catalog (list of product dicts)
    data/catalog_manatec.csv    — flattened table, one row per product

Usage:
    python3 scraper/scrape_manatec.py

Notes:
    * The site only responds to browser-like User-Agents (else HTTP 403).
    * Only pulls public catalogue data; internal BOMs are NOT on the site.
    * Footer / boilerplate categories whose links point to the same category
      pages are de-duplicated automatically.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from lxml import html as lxml_html

BASE = "https://www.manatec.net"
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# The "All categories" landing page used as the crawl root.
INDEX_PAGE = "automotive-service-station-equipment.html"

# Pages that are company info, not product categories.
SKIP_PAGES = {
    "index.html", "index", "", "about-us.html", "corporate-video.html",
    "testimonial.html", "infrastructure.html", "registration-directors-info.html",
    "corporate-brochure.html", "news.html", "enquiry.html", "sitemap.html",
    "photos.html", "contact",
}


def _get(url: str, retries: int = 3) -> bytes:
    last = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            if resp.status_code == 200:
                return resp.content
            last = RuntimeError(f"HTTP {resp.status_code} for {url}")
        except requests.RequestException as exc:  # network / timeout
            last = exc
        time.sleep(1 + attempt)
    raise last or RuntimeError(f"failed to fetch {url}")


def _only_category_links(url: str) -> set[str]:
    """Return {absolute} .html category links found on a page."""
    if urlparse(url).netloc != urlparse(BASE).netloc:
        return set()
    html = _get(url)
    doc = lxml_html.fromstring(html)
    links: set[str] = set()
    for a in doc.xpath("//a[@href]"):
        href = a.get("href", "").strip()
        if not href or href.startswith("javascript:") or href.startswith("#"):
            continue
        abs_url = urljoin(BASE, href).split("#", 1)[0]
        parsed = urlparse(abs_url)
        if parsed.netloc != urlparse(BASE).netloc:  # stay on manatec.net
            continue
        path = parsed.path
        name = path.rsplit("/", 1)[-1]
        if not name.endswith(".html"):
            continue
        if name.lower() in SKIP_PAGES:
            continue
        # Product category pages live at the site root.
        if path.strip("/").count("/") != 0:
            continue
        links.add(abs_url)
    return links


def _parse_category(name_url: str) -> list[dict]:
    """Parse one category page into a list of product dicts."""
    resp = requests.get(name_url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        print(f"    !! HTTP {resp.status_code} {name_url}", file=sys.stderr)
        return []
    doc = lxml_html.fromstring(resp.content)

    # Category display name — derived from og:title / <title> of the form
    # "Wheel Balancer - WBDH 200 HCV Wheel Balancer Manufacturer from…".
    og_title = (doc.xpath('//meta[@property="og:title"]/@content') or [""])[0]
    page_title = " ".join((doc.xpath("//title//text()") or [""])[0].split())
    raw_title = (og_title or page_title).strip()
    category = re.split(r"\s*-\s*", raw_title, maxsplit=1)[0].strip()
    # Landing-template pages don't follow the "Category - Product" title shape.
    page_override = {"new-items.html": "New Items"}
    fname = urlparse(name_url).path.rsplit("/", 1)[-1].lower()
    if fname in page_override:
        category = page_override[fname]
    if not category or len(category) > 80:
        category = re.split(r"\s*Manufacturer\s+from\b", raw_title, maxsplit=1)[0].strip()
    if not category or len(category) > 80:
        category = (doc.xpath("//h1//text()") or [""])[0]
        category = " ".join((category or "").split()).strip()

    products: list[dict] = []
    for section in doc.xpath('//section[contains(@class, "pdp_img_txt")]'):
        name_el = section.xpath('.//h3//span[contains(@class,"fw-bold")]//text()')
        name = " ".join((name_el[0] if name_el else "").split()).strip()
        if not name:
            continue

        # Anchor is the first <a id> inside the section.
        anchor = ""
        for a in section.xpath(".//a[@id]"):
            anchor = a.get("id", "").strip()
            if anchor:
                break

        # Image: the first real (non-lazy placeholder) product image.
        img_url = ""
        for img in section.xpath(".//img[@src]"):
            src = img.get("src", "").strip()
            if src.startswith("data:image"):
                continue
            if "imimg.com" in src or src.startswith("http"):
                img_url = src
                break
        # Thumbnail / larger variant
        if not img_url:
            for img in section.xpath(".//img[@dataimg]"):
                src = img.get("dataimg", "").strip()
                if src.startswith("http"):
                    img_url = src
                    break

        # Price
        price_text = ""
        price_p = section.xpath('.//p[contains(@class,"pdp_prc_cta")]//text()')
        if price_p:
            joined = " ".join(price_p).replace("\u20b9", "₹")
            m = re.search(r"₹\s*([\d,]+)\s*(/\s*[A-Za-z]+)?", joined)
            price_text = m.group(0).strip() if m else " ".join(joined.split())

        # Specs table
        specs: dict[str, str] = {}
        for tr in section.xpath('.//table[contains(@class,"tble1")]//tr'):
            cells = [c for c in tr.xpath("./td//text()") if c.strip()]
            if len(cells) >= 2:
                key = " ".join(cells[0].split()).strip(" :")
                val = " ".join(cells[1].split()).strip()
                if key:
                    specs[key] = val

        # Features list
        features: list[str] = []
        for li in section.xpath('.//div[contains(@class,"cat_desc")]//li//text()'):
            f = " ".join(li.split()).strip()
            if f:
                features.append(f)

        products.append({
            "name": name,
            "category": category,
            "slug": anchor,
            "url": f"{name_url}#{anchor}" if anchor else name_url,
            "price_raw": price_text,
            "image": img_url,
            "specs": specs,
            "features": features,
            "spec_count": len(specs),
            "feature_count": len(features),
        })
    return products


def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape the Manatec product catalogue.")
    ap.add_argument("--categories", help="CSV/one-per-line file of category URLs to scrape (optional).")
    ap.add_argument("--limit", type=int, default=0, help="Max categories to fetch (0 = all).")
    args = ap.parse_args()

    DATA_DIR.mkdir(exist_ok=True)

    # ── Discover category pages ────────────────────────────────────────
    if args.categories:
        cat_path = Path(args.categories)
        if cat_path.suffix.lower() == ".csv":
            with cat_path.open() as fh:
                categories = [r[0] for r in csv.reader(fh) if r]
        else:
            categories = [l.strip() for l in cat_path.read_text().splitlines() if l.strip()]
    else:
        print("Discovering category pages from the " + INDEX_PAGE + " page…")
        cats = _only_category_links(urljoin(BASE, INDEX_PAGE))
        categories = sorted(cats)
        # Pick up a few category pages that only appear in secondary navs.
        for extra in ["pollution-checking-equipments.html",
                      "ac-gas-charging-machine.html",
                      "high-pressure-air-compressor.html",
                      "paint-spray-booth.html",
                      "screw-air-compressor.html",
                      "nitrogen-filling-station.html",
                      "ac-recycling-machine.html",
                      "wheel-aligner.html",
                      "two-post-lift-four-wheeler.html",
                      "hub-motor.html",
                      "tyre-inflator.html",
                      "car-disinfection-system.html",
                      "vacuum-cleaner.html",
                      "tyre-pressure-monitoring-system.html",
                      "3d-printer-filament.html"]:
            categories.append(urljoin(BASE, extra))
        categories = sorted(set(categories))

    print(f"Discovered {len(categories)} category page(s).")

    if args.limit:
        categories = categories[: args.limit]

    # ── Scrape every category ──────────────────────────────────────────
    all_products: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for i, cat in enumerate(categories, 1):
        print(f"[{i}/{len(categories)}] {cat}")
        for p in _parse_category(cat):
            key = (p["name"], p["slug"])
            if key in seen:
                continue
            seen.add(key)
            all_products.append(p)
        time.sleep(0.4)

    all_products.sort(key=lambda p: (p["category"].lower(), p["name"].lower()))

    # ── Write outputs ──────────────────────────────────────────────────
    out_json = DATA_DIR / "catalog_manatec.json"
    out_csv = DATA_DIR / "catalog_manatec.csv"

    out_json.write_text(
        json.dumps(all_products, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    fields = ["name", "category", "slug", "url", "price_raw", "image"]
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(all_products)

    print(f"\nScraped {len(all_products)} unique products across "
          f"{len(categories)} categories.")
    print(f"JSON -> {out_json}")
    print(f"CSV  -> {out_csv}")


if __name__ == "__main__":
    main()