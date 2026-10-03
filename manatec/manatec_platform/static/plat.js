/* Platform UI helpers — API calls (token lives in an httponly cookie, but the
 * JSON API accepts a bearer token; we read it from a non-httponly mirror to
 * keep fetch simple. For the M1 build the cookie-only path is fine: pages are
 * server-rendered, and the few interactive actions below call the API with the
 * bearer token stored client-side. */
window.manatec = {
  async api(path, { method = "GET", body, headers } = {}) {
    const opts = { method, headers: { ...(headers || {}) } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch("/api/v1" + path, opts);
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const msg = (data && (data.detail || data.message)) || res.statusText;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  toast(msg, kind = "ok") {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast " + kind;
    t.classList.remove("hidden");
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => t.classList.add("hidden"), 3200);
  },
};

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form[data-js]").forEach((form) => {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      if (btn) btn.disabled = true;
      const url = form.dataset.action || "/api/v1" + form.dataset.js;
      const body = {};
      new FormData(form).forEach((v, k) => { body[k] = v; });
      try {
        const res = await window.manatec.api(url, { method: "POST", body });
        window.manatec.toast("Done.");
        if (form.dataset.redirect) location.href = form.dataset.redirect;
        else window.location.reload();
      } catch (err) {
        window.manatec.toast("Error: " + err.message, "err");
        if (btn) btn.disabled = false;
      }
    });
  });
});