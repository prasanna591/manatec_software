"""Manatec platform — FastAPI app: JSON API v1 + server-rendered UI."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import atp_service, bom_service, seed as seed_module
from .api import api_router
from .db import SessionLocal, get_session, init_db
from .helpers import committed, in_transit, on_hand
from .models import (
    AuditLog, BomHeader, Family, InventoryLedger, InventoryStock, Item, Product,
    Supplier, User,
)
from .security import authenticate, create_token, decode_token

BASE_DIR = Path(__file__).resolve().parent

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            seed_module.seed_all(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Manatec Platform", version="0.1.0", lifespan=lifespan)
app.include_router(api_router)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
templates.env.filters["inr"] = lambda v: "₹ {:,.0f}".format(float(v or 0))

COOKIE = "manatec_token"


def current_user(request: Request) -> User | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    db = SessionLocal()
    try:
        payload = decode_token(token)
        user = db.get(User, int(payload.get("sub", 0)))
        return user if user and user.is_active else None
    except Exception:  # noqa: BLE001
        return None
    finally:
        db.close()


# ── auth ─────────────────────────────────────────────────────────────────
@app.get("/ui/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(
        "login.html", {"request": request, "error": None})


@app.post("/ui/login")
def ui_login(request: Request, username: str = Form(...), password: str = Form(...)):
    db = SessionLocal()
    try:
        user = authenticate(db, username, password)
        if not user:
            return templates.TemplateResponse(
                "login.html", {"request": request, "error": "Invalid username or password"})
        resp = RedirectResponse(url="/", status_code=303)
        resp.set_cookie(COOKIE, create_token(user), httponly=True,
                        samesite="lax", max_age=86400)
        return resp
    finally:
        db.close()


@app.post("/ui/logout")
def ui_logout():
    resp = RedirectResponse(url="/ui/login", status_code=303)
    resp.delete_cookie(COOKIE)
    return resp


@app.get("/samples/{name}")
def sample_downloads(name: str):
    """Serve the demo CSV files for import trials."""
    from fastapi.responses import FileResponse
    from .config import SAMPLE_BOM, SAMPLE_INVENTORY
    files = {"bom": SAMPLE_BOM, "inventory": SAMPLE_INVENTORY}
    if name not in files:
        raise HTTPException(404, "Unknown sample")
    return FileResponse(str(files[name]), filename=files[name].name,
                        media_type="text/csv")


def _page(request: Request, template: str, **ctx):
    user = current_user(request)
    if not user:
        return RedirectResponse(url="/ui/login")
    ctx.update({"request": request, "user": user})
    return templates.TemplateResponse(template, ctx)


@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    from .dash_util import dashboard_context
    db = SessionLocal()
    try:
        ctx = dashboard_context(db)
    finally:
        db.close()
    return _page(request, "dashboard.html", section="Dashboard", **ctx)


# ── pages ────────────────────────────────────────────────────────────────
@app.get("/products", response_class=HTMLResponse)
def ui_products(request: Request):
    db = SessionLocal()
    try:
        q = request.query_params.get("q", "")
        rows = db.query(Product).filter(Product.status == "active")
        if q:
            rows = rows.filter(func.lower(Product.name).like(f"%{q.lower()}%"))
        rows = rows.order_by(Product.name).all()
        products = [{
            "id": p.id, "name": p.name, "category": p.category,
            "family_name": db.get(Family, p.family_id).name if p.family_id else None,
            "image_url": p.image_url, "price_raw": p.price_raw,
            "price_value": float(p.price_value or 0),
        } for p in rows]
        fams = [{"id": f.id, "name": f.name} for f in db.query(Family).order_by(Family.name)]
    finally:
        db.close()
    return _page(request, "products.html", section="Product Catalogue",
                 products=products, families=fams, q=q, total=len(products))


@app.get("/products/{product_id}", response_class=HTMLResponse)
def ui_product_detail(request: Request, product_id: int):
    db = SessionLocal()
    try:
        p = db.get(Product, product_id)
        if not p:
            raise HTTPException(404, "Product not found")
        atp = atp_service.buildable_now(db, product_id)
        meta = bom_service.bom_meta(db, product_id)
        flat = bom_service.explode(db, product_id)
        items = db.query(Item).filter(Item.id.in_(flat.keys())).all() if flat else []
        coverage = atp.coverage if atp.has_bom else []
    finally:
        db.close()
    return _page(request, "product_detail.html", section="Model",
                 product=p, atp=atp, meta=meta, coverage=coverage, flat=flat)


@app.get("/items", response_class=HTMLResponse)
def ui_items(request: Request):
    db = SessionLocal()
    try:
        items = db.query(Item).order_by(Item.code).all()
        view = [{
            "item": it,
            "on_hand": on_hand(db, it.id),
            "in_transit": in_transit(db, it.id),
            "committed": committed(db, it.id),
        } for it in items]
    finally:
        db.close()
    return _page(request, "items.html", section="Item Master", items=view)


@app.get("/inventory", response_class=HTMLResponse)
def ui_inventory(request: Request):
    from .models import InventoryStock
    db = SessionLocal()
    try:
        rows = (
            db.query(Item, InventoryStock.on_hand)
            .join(InventoryStock, InventoryStock.item_id == Item.id)
            .order_by(Item.code)
            .all()
        )
        stock = [{
            "item": it, "on_hand": float(oh or 0),
            "in_transit": in_transit(db, it.id),
            "committed": committed(db, it.id),
            "available": float(oh or 0) + in_transit(db, it.id) - committed(db, it.id),
        } for it, oh in rows]
        alerts = []
        for s in stock:
            mn = float(getattr(s["item"], "min_qty") or 0)
            if mn > 0 and s["on_hand"] < mn:
                alerts.append({"item": s["item"], "on_hand": s["on_hand"],
                               "min_qty": mn, "short_by": round(mn - s["on_hand"], 3)})
        alerts.sort(key=lambda a: a["short_by"], reverse=True)
        ledger_rows = (
            db.query(InventoryLedger, Item.code)
            .join(Item, Item.id == InventoryLedger.item_id)
            .order_by(InventoryLedger.created_at.desc()).limit(60).all()
        )
        ledger = [{
            "code": code, "trans_type": r.trans_type, "qty_delta": float(r.qty_delta),
            "ref_type": r.ref_type, "note": r.note,
            "created_at": r.created_at.strftime("%d %b %H:%M") if r.created_at else "",
        } for r, code in ledger_rows]
    finally:
        db.close()
    return _page(request, "inventory.html", section="Inventory",
                 stock=stock, alerts=alerts, ledger=ledger)


@app.get("/bom", response_class=HTMLResponse)
def ui_bom(request: Request):
    db = SessionLocal()
    try:
        headers = (db.query(BomHeader)
                   .filter(BomHeader.status == "active", BomHeader.product_id.isnot(None))
                   .order_by(BomHeader.product_id).all())
        rows = []
        for h in headers:
            p = db.get(Product, h.product_id)
            flat = bom_service.explode(db, h.product_id)
            rows.append({
                "id": h.id, "product_id": h.product_id,
                "product_name": p.name if p else "?",
                "category": p.category if p else "",
                "rev_no": h.rev_no,
                "lines": len(bom_service.lines_for(db, h.id)),
                "exploded_items": len(flat),
            })
    finally:
        db.close()
    return _page(request, "bom_list.html", section="BOM Register", rows=rows)


@app.get("/bom/{product_id}", response_class=HTMLResponse)
def ui_bom_detail(request: Request, product_id: int):
    db = SessionLocal()
    try:
        p = db.get(Product, product_id)
        if not p:
            raise HTTPException(404, "Product not found")
        tree = bom_service.tree(db, product_id)
        flat = bom_service.explode(db, product_id)
        report = atp_service.build_n(db, product_id, target_qty=0)
        item_rows = []
        for item_id, qty in sorted(flat.items(), key=lambda kv: kv[1], reverse=True):
            it = db.get(Item, item_id)
            if it:
                av = on_hand(db, it.id) + in_transit(db, it.id) - committed(db, it.id)
                item_rows.append({
                    "item": it, "qty_per_unit": float(qty),
                    "on_hand": on_hand(db, it.id),
                    "in_transit": in_transit(db, it.id),
                    "committed": committed(db, it.id),
                    "available": av,
                })
    finally:
        db.close()
    return _page(request, "bom_detail.html", section="BOM — " + p.name,
                 product=p, tree=tree, item_rows=item_rows, report=report)


@app.get("/atp", response_class=HTMLResponse)
def ui_atp(request: Request):
    db = SessionLocal()
    try:
        results = atp_service.all_buildable(db)
        results.sort(key=lambda r: (r.buildable_now is None, r.buildable_now or -1))
    finally:
        db.close()
    return _page(request, "atp.html", section="Available-to-Promise", results=results)


@app.get("/procurement", response_class=HTMLResponse)
def ui_procurement(request: Request):
    from .procurement_service import all_pos
    db = SessionLocal()
    try:
        pos = all_pos(db)
        products = db.query(Product).order_by(Product.name).all()
        suppliers = db.query(Supplier).order_by(Supplier.name).all()
    finally:
        db.close()
    return _page(request, "procurement.html", section="Procurement",
                 pos=pos, products=products, suppliers=suppliers)


@app.get("/production", response_class=HTMLResponse)
def ui_production(request: Request):
    from .production_service import all_orders
    db = SessionLocal()
    try:
        orders = all_orders(db)
        products = db.query(Product).order_by(Product.name).all()
    finally:
        db.close()
    return _page(request, "production.html", section="Production Orders",
                 orders=orders, products=products)


@app.get("/quotes", response_class=HTMLResponse)
def ui_quotes(request: Request):
    from .quote_service import all_quotes
    db = SessionLocal()
    try:
        quotes = all_quotes(db)
        products = db.query(Product).order_by(Product.name).all()
    finally:
        db.close()
    return _page(request, "quotes.html", section="Quotations",
                 quotes=quotes, products=products)


@app.get("/audit", response_class=HTMLResponse)
def ui_audit(request: Request):
    db = SessionLocal()
    try:
        rows = (db.query(AuditLog, User.username)
                .outerjoin(User, User.id == AuditLog.user_id)
                .order_by(AuditLog.created_at.desc()).limit(200).all())
        audit_rows = [{
            "id": a.id, "action": a.action, "entity": a.entity,
            "entity_id": a.entity_id, "username": u,
            "created_at": a.created_at.strftime("%d %b %H:%M") if a.created_at else "",
            "details": a.details or {},
        } for a, u in rows]
    finally:
        db.close()
    return _page(request, "audit.html", section="Audit Trail", rows=audit_rows)