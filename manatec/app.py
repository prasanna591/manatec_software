#!/usr/bin/env python3
"""
BOM Analyzer — Web UI backend.

Starts a local Flask server. Upload an inventory file plus a master BOM
file, and the UI shows exactly how many of each product can be built,
what is missing, and what is extra.

Run with:  python3 app.py        then open http://127.0.0.1:5000
"""

import io

from flask import Flask, jsonify, render_template, request, send_file

from bom_solver import analyze_product, read_inventory, read_master
from catalog import enrich

app = Flask(__name__)


def _fail(code: int, message: str):
    return jsonify({"error": message}), code


def _collect_products(bom_map, analysis, inventory):
    """Merge BOM + analysis into a list of JSON-serializable product dicts."""
    products = []
    for pname, bom in bom_map.items():
        r = analysis[pname]
        rows = []
        for item, need_per_unit in sorted(bom.items()):
            have = inventory.get(item, 0)
            buildable = r["max_units"]
            rows.append({
                "item": item,
                "in_bom": True,
                "need": need_per_unit,
                "have": have,
                "capacity": (have // need_per_unit) if need_per_unit > 0 else 0,
                "max_units": buildable,
                "stock_after": max(have - buildable * need_per_unit, 0),
                "shortage": max(need_per_unit - have, 0) if have < need_per_unit else 0,
                "status": "OK" if have >= need_per_unit else "SHORT",
            })
        for item, have in sorted(inventory.items()):
            if item not in bom:
                rows.append({
                    "item": item,
                    "in_bom": False,
                    "need": 0,
                    "have": have,
                    "capacity": "—",
                    "max_units": 0,
                    "stock_after": have,
                    "shortage": 0,
                    "status": "EXTRA",
                })
        products.append({
            "name": pname,
            "max_units": r["max_units"],
            "status": "OK" if r["max_units"] > 0 else "BLOCKED",
            "bom_item_count": r["bom_item_count"],
            "missing_count": len(r["missing_items"]),
            "shortage_count": len(r["shortage_details"]),
            "leftover_count": len(r["leftover_after_production"]),
            "leftover_total": sum(r["leftover_after_production"].values()),
            "unused_count": len(r["extra_unmatched"]),
            "unused_total": sum(r["extra_unmatched"].values()),
            "rows": rows,
            **enrich(pname),
        })
    return products


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    inv_file = request.files.get("inventory")
    master_file = request.files.get("master")
    if not inv_file or not master_file:
        return _fail(400, "Both an inventory file and a master BOM file are required.")
    if not inv_file.filename or not master_file.filename:
        return _fail(400, "Uploaded files must have a name.")

    overrides = {
        "item_col": request.form.get("inv_item") or None,
        "qty_col": request.form.get("inv_qty") or None,
        "master_item": request.form.get("master_item") or None,
        "master_qty": request.form.get("master_qty") or None,
        "master_product": request.form.get("master_product") or None,
    }

    try:
        inv = read_inventory(
            inv_file.filename, source=io.BytesIO(inv_file.read()),
            filename=inv_file.filename,
            item_col=overrides["item_col"], qty_col=overrides["qty_col"],
        )
    except Exception as exc:  # noqa: BLE001 — surface readable errors
        return _fail(400, f"Inventory file error: {exc}")

    try:
        bom_map = read_master(
            master_file.filename, source=io.BytesIO(master_file.read()),
            filename=master_file.filename,
            item_col=overrides["master_item"], qty_col=overrides["master_qty"],
            product_col=overrides["master_product"],
        )
    except Exception as exc:  # noqa: BLE001
        return _fail(400, f"Master BOM file error: {exc}")

    analysis = {pname: analyze_product(bom, inv) for pname, bom in bom_map.items()}
    products = _collect_products(bom_map, analysis, inv)

    buildable = sum(1 for p in products if p["status"] == "OK")
    return jsonify({
        "inventory_count": len(inv),
        "master_item_count": sum(len(b) for b in bom_map.values()),
        "product_count": len(products),
        "buildable": buildable,
        "blocked": len(products) - buildable,
        "products": products,
    })


@app.route("/api/export", methods=["POST"])
def export():
    """Regenerate an Excel (or CSV) workbook from the previously returned analysis."""
    payload = request.get_json(silent=True) or {}
    products = payload.get("products", [])
    if not products:
        return _fail(400, "Nothing to export.")

    fmt = request.args.get("format", "xlsx").lower()
    buf = io.BytesIO()

    if fmt == "csv":
        import csv

        lines = []
        for p in products:
            for row in p["rows"]:
                lines.append({
                    "Product": p["name"], "Item": row["item"],
                    "In BOM": "Yes" if row["in_bom"] else "No",
                    "Qty Required/Unit": row["need"], "Inventory": row["have"],
                    "Max Units": row["max_units"], "Stock After": row["stock_after"],
                    "Shortage": row["shortage"], "Status": row["status"],
                })
        if lines:
            keys = list(lines[0].keys())
            text = io.StringIO()
            w = csv.DictWriter(text, fieldnames=keys)
            w.writeheader()
            w.writerows(lines)
            buf.write(text.getvalue().encode("utf-8"))
            buf.seek(0)
            return send_file(buf, mimetype="text/csv",
                             as_attachment=True, download_name="bom_report.csv")
        return _fail(400, "Export produced no rows.")

    # Excel
    import pandas as pd

    summary = []
    for p in products:
        summary.append({
            "Product": p["name"],
            "BOM Components": p["bom_item_count"],
            "Max Units Buildable": p["max_units"],
            "Missing Items": p["missing_count"],
            "Short Items": p["shortage_count"],
            "Leftover Items (post-build)": p["leftover_count"],
            "Unused Inventory Items": p["unused_count"],
        })
    with pd.ExcelWriter(buf, engine="xlsxwriter") as writer:
        pd.DataFrame(summary).to_excel(writer, sheet_name="Summary", index=False)
        ws = writer.sheets["Summary"]
        ws.set_column("A:A", 35)
        for col_letter in "BCDEFG":
            ws.set_column(f"{col_letter}:{col_letter}", 20)

        for p in products:
            sheet = (p["name"][:28] + "...") if len(p["name"]) > 31 else p["name"]
            df = pd.DataFrame([{
                "Item": row["item"], "In BOM": "Yes" if row["in_bom"] else "No",
                "Qty Required/Unit": row["need"], "Inventory": row["have"],
                "Units Buildable (this item only)": row["capacity"],
                "Max Product Units": row["max_units"],
                "Stock After Production": row["stock_after"],
                "Shortage": row["shortage"],
            } for row in p["rows"]])
            df.to_excel(writer, sheet_name=sheet, index=False)
            ws = writer.sheets[sheet]
            ws.set_column("A:A", 40)
            ws.set_column("B:I", 16)

    buf.seek(0)
    return send_file(buf, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     as_attachment=True, download_name="bom_report.xlsx")


if __name__ == "__main__":
    print("\n  BOM Analyzer UI")
    print("  ───────────────")
    print("  Open  http://127.0.0.1:5000  in your browser\n")
    app.run(host="0.0.0.0", port=5000, debug=True)