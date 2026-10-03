/* BOM Analyzer — frontend logic */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const state = {
    files: { inventory: null, master: null },
    lastAnalysis: null,
  };

  const fmt = (n) => new Intl.NumberFormat("en-US").format(n ?? 0);

  /* ── File upload wiring ─────────────────────────────── */
  function bindDropzone(dzId, inputId, key) {
    const dz = $(dzId);
    const input = $(inputId);
    const label = $("#" + key + "FileLabel");

    dz.addEventListener("click", () => input.click());
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      if (e.dataTransfer.files.length) setFile(key, e.dataTransfer.files[0],
        input, dz, label);
    });
    input.addEventListener("change", () => {
      if (input.files.length) setFile(key, input.files[0], input, dz, label);
    });
  }

  function setFile(key, file, input, dz, label) {
    state.files[key] = file;
    label.textContent = file.name;
    dz.classList.add("has-file");
    $("#btnRun").disabled = !(state.files.inventory && state.files.master);
    hideNotice();
  }

  function clearNotice() { const n = $("#notice"); n.innerHTML = ""; }
  function hideNotice() { $("#notice").classList.remove("hidden"); clearNotice(); }
  function showError(msg) {
    const n = $("#notice");
    n.classList.remove("hidden");
    n.innerHTML = `<div class="notice-err">${msg.replace(/</g, "&lt;")}</div>`;
  }

  bindDropzone("#dzInventory", "#fileInventory", "inv");
  bindDropzone("#dzMaster", "#fileMaster", "master");

  /* ── Sample files ───────────────────────────────────── */
  const SAMPLE_INV = "/static/sample_inventory.csv";
  const SAMPLE_MST = "/static/sample_master_bom.csv";

  $("#btnSample").addEventListener("click", async () => {
    try {
      const inv = await fetch(SAMPLE_INV).then((r) => r.blob());
      const mst = await fetch(SAMPLE_MST).then((r) => r.blob());
      const invFile = new File([inv], "sample_inventory.csv", { type: "text/csv" });
      const mstFile = new File([mst], "sample_master_bom.csv", { type: "text/csv" });
      setFile("inventory", invFile, $("#fileInventory"), $("#dzInventory"), $("#invFileLabel"));
      setFile("master", mstFile, $("#fileMaster"), $("#dzMaster"), $("#masterFileLabel"));
    } catch (e) {
      showError("Could not load sample files: " + e.message);
    }
  });

  /* ── Run analysis ───────────────────────────────────── */
  $("#btnRun").addEventListener("click", async () => {
    const fd = new FormData();
    fd.append("inventory", state.files.inventory);
    fd.append("master", state.files.master);
    for (const [id, key] of [["ovInvItem", "inv_item"], ["ovInvQty", "inv_qty"],
                             ["ovMasterItem", "master_item"], ["ovMasterQty", "master_qty"],
                             ["ovMasterProduct", "master_product"]]) {
      const v = $(`#${id}`).value.trim();
      if (v) fd.append(key, v);
    }

    $("#emptyState").classList.add("hidden");
    $("#loading").classList.remove("hidden");
    $("#results").classList.add("hidden");
    hideNotice();

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      render(data);
    } catch (e) {
      $("#loading").classList.add("hidden");
      $("#emptyState").classList.remove("hidden");
      showError(e.message);
    }
  });

  /* ── Render ─────────────────────────────────────────── */
  function render(data) {
    state.lastAnalysis = data;
    $("#loading").classList.add("hidden");
    $("#results").classList.remove("hidden");

    const okNote = `<div class="notice-ok">✅ Analysis complete — ${data.product_count} products
      analyzed against ${fmt(data.inventory_count)} inventory items.</div>`;
    $("#notice").innerHTML = okNote;

    // summary cards
    const cards = [
      ["accent", fmt(data.product_count), "Products"],
      ["ok", fmt(data.buildable), "Buildable"],
      ["bad", fmt(data.blocked), "Blocked / Missing parts"],
      ["accent", fmt(data.inventory_count), "Inventory items"],
      ["accent", fmt(data.master_item_count), "BOM line items"],
    ];
    $("#summaryCards").innerHTML = cards.map(([cls, num, lbl]) =>
      `<div class="card ${cls}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`
    ).join("");

    // product tiles
    const container = $("#products");
    container.innerHTML = "";
    for (const p of data.products) {
      container.appendChild(buildProductTile(p));
    }
  }

  function buildProductTile(p) {
    const tile = document.createElement("div");
    tile.className = "product";

    const statusBadge = p.status === "OK"
      ? '<span class="badge ok">OK</span>'
      : '<span class="badge blocked">Blocked</span>';

    const thumb = p.catalog_image
      ? `<img class="product-thumb" src="${esc(p.catalog_image)}" alt="${esc(p.name)}"
            referrerpolicy="no-referrer" loading="lazy" />`
      : `<div class="product-thumb product-thumb-ph">${esc((p.name || "?").charAt(0).toUpperCase())}</div>`;
    const catLine = p.catalog_category
      ? `<div class="product-cat">${esc(p.catalog_category)}</div>` : "";

    const head = document.createElement("div");
    head.className = "product-head";
    head.innerHTML = `
      ${thumb}
      <div class="product-id">
        ${catLine}
        <div class="product-name">${esc(p.name)}</div>
      </div>
      ${statusBadge}
      <div class="big-unit"><div class="units ${p.status !== "OK" ? "bad" : ""}">${fmt(p.max_units)}</div>
        <div class="unit-lbl">units buildable</div></div>
      <div class="chev">▼</div>`;

    const stats = document.createElement("div");
    stats.className = "product-stats";
    stats.innerHTML = `
      <span class="stat-chip">BOM items <b>${p.bom_item_count}</b></span>
      <span class="stat-chip">Missing <b>${p.missing_count}</b></span>
      <span class="stat-chip">Short <b>${p.shortage_count}</b></span>
      <span class="stat-chip">Leftover items <b>${p.leftover_count}</b></span>
      <span class="stat-chip">Unused inventory <b>${p.unused_count}</b> (${fmt(p.unused_total)} pcs)</span>`;

    const body = document.createElement("div");
    body.className = "product-body";
    body.appendChild(buildTable(p));

    tile.appendChild(head);
    tile.appendChild(stats);
    tile.appendChild(body);

    head.addEventListener("click", () => {
      tile.classList.toggle("open");
    });
    return tile;
  }

  function buildTable(p) {
    const wrap = document.createElement("div");

    const frow = document.createElement("div");
    frow.className = "filter-row";
    frow.innerHTML = `
      <input type="text" placeholder='Search items…' class="tbl-filter" />
      <select class="tbl-status">
        <option value="all">All status</option>
        <option value="short">Short</option>
        <option value="extra">Not in BOM</option>
        <option value="ok">OK</option>
      </select>
      <span class="count-hint tbl-count"></span>`;
    wrap.appendChild(frow);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap";
    tableWrap.innerHTML = `
      <table>
        <thead><tr>
          <th>Item</th><th>Status</th><th class="num">Req/unit</th><th class="num">Have</th>
          <th class="num">Capacity</th><th class="num">Max units</th>
          <th class="num">Stock after</th><th class="num">Shortage</th>
        </tr></thead>
        <tbody class="tbl-body"></tbody>
      </table>`;
    wrap.appendChild(tableWrap);

    const tbody = tableWrap.querySelector(".tbl-body");
    const allRows = p.rows.map((r, i) => ({ ...r, _idx: i }));

    const renderRows = (filter, status) => {
      let rows = allRows;
      if (filter) {
        rows = rows.filter((r) => r.item.toLowerCase().includes(filter));
      }
      if (status === "short") rows = rows.filter((r) => r.status === "SHORT");
      else if (status === "extra") rows = rows.filter((r) => r.status === "EXTRA");
      else if (status === "ok") rows = rows.filter((r) => r.status === "OK");

      tbody.innerHTML = rows.map(rowHTML).join("");
      wrap.querySelector(".tbl-count").textContent = `${rows.length} / ${allRows.length} items`;
    };

    const filterInput = frow.querySelector(".tbl-filter");
    const statusSel = frow.querySelector(".tbl-status");
    filterInput.addEventListener("input", () => renderRows(filterInput.value.trim().toLowerCase(), statusSel.value));
    statusSel.addEventListener("change", () => renderRows(filterInput.value.trim().toLowerCase(), statusSel.value));

    renderRows("", "all");
    return wrap;
  }

  function rowHTML(r) {
    const cls = r.status === "SHORT" ? "row-short" : r.status === "EXTRA" ? "row-extra" : "row-ok";
    const tagClass = r.status === "SHORT" ? "short" : r.status === "EXTRA" ? "extra" : "ok";
    const tagText = r.status === "SHORT" ? "Short" : r.status === "EXTRA" ? "Extra" : "OK";
    const short = r.shortage > 0 ? `<span class="short-tag">-${fmt(r.shortage)}</span>` : "—";
    const cap = r.capacity === "—" ? "—" : fmt(r.capacity);
    const have = r.status === "EXTRA" ? "—" : fmt(r.have);
    const need = r.status === "EXTRA" ? "—" : fmt(r.need);
    return `<tr class="${cls}">
      <td>${esc(r.item)}</td>
      <td><span class="tag ${tagClass}">${tagText}</span></td>
      <td class="num">${need}</td>
      <td class="num">${have}</td>
      <td class="num">${cap}</td>
      <td class="num">${fmt(r.max_units)}</td>
      <td class="num">${r.status === "EXTRA" ? fmt(r.stock_after) : fmt(r.stock_after)}</td>
      <td class="num">${short}</td>
    </tr>`;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
})();