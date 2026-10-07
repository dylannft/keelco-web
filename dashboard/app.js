/* Keel Co client dashboard.
 * No framework and no libraries: talks to Supabase Auth and the REST API directly.
 * What each signed-in person can see is enforced by row-level security in the database. */
(function () {
  "use strict";
  var C = window.KEEL_CONFIG;
  var TZ = C.timezone || "Australia/Brisbane";
  var SESSION_KEY = "keel.session";

  // ---------- small helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function show(id) { ["view-loading", "view-login", "view-app"].forEach(function (v) { $(v).hidden = v !== id; }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var memStore = {};
  function storeGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return memStore[k] || null; } }
  function storeSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { memStore[k] = v; } }
  function storeDel(k) { try { window.localStorage.removeItem(k); } catch (e) { delete memStore[k]; } }
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600); }

  var TYPE_LABELS = {
    lockout_access: "Lockout or access", maintenance: "Maintenance", complaint_cleanliness: "Cleanliness complaint",
    complaint_other: "Complaint", booking_enquiry: "Booking enquiry", stay_question: "Question about a stay",
    owner: "Property owner", supplier_or_trade: "Supplier or trade", emergency_000: "Emergency (told to call 000)",
    sales_or_spam: "Sales or spam", other: "Other"
  };
  function typeLabel(t) { return TYPE_LABELS[t] || (t ? t.replace(/_/g, " ") : "Other"); }

  var fmtDay = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
  var fmtTime = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
  var fmtFull = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true });
  var fmtKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  var fmtParts = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", hour: "numeric", hour12: false });
  function when(c) { return new Date(c.started_at || c.created_at); }
  function dayKey(d) { return fmtKey.format(d); }
  function timeStr(d) { return fmtTime.format(d).replace(" ", "").toLowerCase(); }
  function relDay(d) {
    var today = dayKey(new Date()), y = dayKey(new Date(Date.now() - 864e5)), k = dayKey(d);
    return k === today ? "Today" : k === y ? "Yesterday" : fmtDay.format(d);
  }
  function isAfterHours(d) {
    var parts = fmtParts.formatToParts(d), wd = "", hr = 0;
    parts.forEach(function (p) { if (p.type === "weekday") wd = p.value; if (p.type === "hour") hr = parseInt(p.value, 10) % 24; });
    return wd === "Sat" || wd === "Sun" || hr < 9 || hr >= 17;
  }
  function duration(s) { if (!s && s !== 0) return "Not recorded"; var m = Math.floor(s / 60), r = s % 60; return (m ? m + " min " : "") + r + " sec"; }
  function prettyPhone(n) {
    if (!n) return "";
    var d = String(n).replace(/[^\d+]/g, "");
    if (/^\+61\d{9}$/.test(d)) { d = "0" + d.slice(3); }
    if (/^04\d{8}$/.test(d)) return d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7);
    if (/^0\d{9}$/.test(d)) return d.slice(0, 2) + " " + d.slice(2, 6) + " " + d.slice(6);
    return n;
  }
  function telHref(n) { return "tel:" + String(n || "").replace(/[^\d+]/g, ""); }

  // ---------- auth ----------
  var session = null;
  function loadSession() { try { session = JSON.parse(storeGet(SESSION_KEY) || "null"); } catch (e) { session = null; } }
  function saveSession(s) { session = s; if (s) storeSet(SESSION_KEY, JSON.stringify(s)); else storeDel(SESSION_KEY); }

  function authFetch(path, opts) {
    opts = opts || {};
    var h = Object.assign({ apikey: C.supabaseKey, "Content-Type": "application/json" }, opts.headers || {});
    return fetch(C.supabaseUrl + path, Object.assign({}, opts, { headers: h }));
  }

  function takeTokensFromUrl() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash) return null;
    var p = new URLSearchParams(hash);
    var cleanUrl = window.location.pathname + window.location.search;
    if (p.get("error") || p.get("error_description")) {
      history.replaceState(null, "", cleanUrl);
      return { error: p.get("error_code") === "otp_expired" ? "That sign-in link has expired or was already used. Send yourself a new one." : (p.get("error_description") || "Sign-in didn't work. Send yourself a new link.").replace(/\+/g, " ") };
    }
    if (p.get("access_token")) {
      history.replaceState(null, "", cleanUrl);
      return { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: Math.floor(Date.now() / 1000) + parseInt(p.get("expires_in") || "3600", 10) };
    }
    return null;
  }

  function refresh() {
    if (!session || !session.refresh_token) return Promise.reject(new Error("no session"));
    return authFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) })
      .then(function (r) { if (!r.ok) throw new Error("refresh failed"); return r.json(); })
      .then(function (j) { saveSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: (j.user && j.user.email) || session.email }); return session; });
  }
  function validSession() {
    if (!session) return Promise.reject(new Error("no session"));
    if (session.expires_at - 60 > Date.now() / 1000) return Promise.resolve(session);
    return refresh();
  }
  function api(path, opts) {
    return validSession().then(function (s) {
      opts = opts || {};
      opts.headers = Object.assign({ Authorization: "Bearer " + s.access_token }, opts.headers || {});
      return authFetch(path, opts);
    }).then(function (r) {
      if (r.status === 401) { signOutLocal(); throw new Error("signed out"); }
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ("Request failed: " + r.status)); });
      return r.status === 204 ? null : r.json();
    });
  }
  function signOutLocal() { saveSession(null); show("view-login"); }

  // ---------- login view ----------
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("login-email").value.trim(), st = $("login-status");
    st.className = "status"; st.textContent = "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { st.className = "status err"; st.textContent = "Enter a full email address, like name@business.com.au."; $("login-email").focus(); return; }
    var btn = $("login-btn"); btn.disabled = true; btn.textContent = "Sending link…";
    var pend = storeGet("keel.pending");
    var redirect = window.location.origin + "/dashboard" + (pend ? "?c=" + encodeURIComponent(pend) : "");
    // create_user:false: only people Keel Co has set up can sign in. The reply is the same
    // whether or not the email has access, so this page never reveals who our clients are.
    authFetch("/auth/v1/otp?redirect_to=" + encodeURIComponent(redirect), { method: "POST", body: JSON.stringify({ email: email, create_user: false }) })
      .then(function (r) {
        if (r.status === 429) throw new Error("Too many sign-in emails were sent. Wait a minute, then try again.");
        if (r.status >= 500) throw new Error("We couldn't send the link just now. Try again in a minute.");
        $("sent-to").textContent = email; $("login-form").hidden = true; $("login-sent").hidden = false;
      })
      .catch(function (err) { st.className = "status err"; st.textContent = err.message; })
      .finally(function () { btn.disabled = false; btn.textContent = "Email me a sign-in link"; });
  });
  $("login-again").addEventListener("click", function () { $("login-sent").hidden = true; $("login-form").hidden = false; $("login-email").focus(); });

  $("sign-out").addEventListener("click", function () {
    var tok = session && session.access_token;
    if (tok) authFetch("/auth/v1/logout", { method: "POST", headers: { Authorization: "Bearer " + tok } }).catch(function () {});
    signOutLocal();
  });

  // ---------- app state ----------
  var state = { clients: [], clientId: null, calls: [], period: "7", openId: null };

  function loadApp() {
    show("view-app");
    $("user-email").textContent = session.email || "";
    return api("/auth/v1/user").then(function (u) {
      if (u && u.email) { session.email = u.email; saveSession(session); $("user-email").textContent = u.email; }
      return api("/rest/v1/clients?select=id,name&order=name");
    }).then(function (clients) {
      state.clients = clients || [];
      if (!state.clients.length) {
        $("content").hidden = true; $("no-access").hidden = false; $("no-access-email").textContent = session.email || "this email";
        $("client-name").textContent = ""; return;
      }
      var saved = storeGet("keel.client");
      state.clientId = state.clients.some(function (c) { return c.id === saved; }) ? saved : state.clients[0].id;
      renderClientPicker();
      return loadCalls();
    }).catch(function (err) {
      if (String(err.message) === "signed out" || String(err.message) === "no session") return;
      $("content").hidden = true; $("no-access").hidden = false;
      $("no-access").innerHTML = "<h2>The call log didn't load</h2><p>Check your connection and refresh the page. If it keeps happening, email " + esc(C.contactEmail) + ".</p>";
    });
  }

  function renderClientPicker() {
    var cur = state.clients.find(function (c) { return c.id === state.clientId; });
    $("client-name").textContent = cur ? cur.name.replace(/\s*\((pitch )?demo\)\s*$/i, "") : "";
    var sel = $("client-select");
    if (state.clients.length > 1) {
      sel.innerHTML = state.clients.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === state.clientId ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("");
      sel.hidden = false; $("client-name").hidden = true;
    }
  }
  $("client-select").addEventListener("change", function (e) { state.clientId = e.target.value; storeSet("keel.client", state.clientId); loadCalls(); });

  function loadCalls() {
    var cols = "id,conversation_id,started_at,created_at,duration_seconds,caller_number,caller_name,callback_number,request_type,urgency,reason,unanswered_question,summary,transcript,alert_sent_at,handled_at,handled_by";
    return api("/rest/v1/calls?select=" + cols + "&client_id=eq." + encodeURIComponent(state.clientId) + "&order=started_at.desc.nullslast&limit=1000")
      .then(function (rows) {
        state.calls = rows || []; buildTypeFilter(); render();
        var want = storeGet("keel.pending");
        if (want) {
          storeDel("keel.pending");
          var hit = state.calls.find(function (c) { return c.conversation_id === want || c.id === want; });
          if (hit) { state.period = "all"; document.querySelectorAll(".segmented button").forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-period") === "all")); }); render(); openCall(hit.id); }
        }
      });
  }

  // ---------- rendering ----------
  function inPeriod(c) {
    if (state.period === "all") return true;
    return when(c).getTime() >= Date.now() - parseInt(state.period, 10) * 864e5;
  }
  function isWaiting(c) { return !c.handled_at && c.request_type !== "sales_or_spam"; }

  function render() {
    var calls = state.calls.filter(inPeriod);
    var urgent = calls.filter(function (c) { return c.urgency === "urgent"; }).length;
    var after = calls.filter(function (c) { return isAfterHours(when(c)); }).length;
    var waiting = state.calls.filter(isWaiting);
    $("fig-calls").textContent = calls.length;
    $("fig-urgent").textContent = urgent;
    $("fig-after").textContent = after;
    $("fig-waiting").textContent = waiting.length;
    $("fig-waiting").parentElement.classList.toggle("attn", waiting.some(function (c) { return c.urgency === "urgent"; }));
    renderChart(calls);
    renderWaiting(waiting);
    renderRows();
  }

  function renderWaiting(list) {
    list = list.slice().sort(function (a, b) {
      var ua = a.urgency === "urgent" ? 0 : 1, ub = b.urgency === "urgent" ? 0 : 1;
      return ua - ub || when(b) - when(a);
    }).slice(0, 6);
    var ul = $("waiting");
    if (!list.length) { ul.innerHTML = '<li class="none">Nothing waiting. Every call has been returned.</li>'; return; }
    ul.innerHTML = list.map(function (c) {
      var d = when(c);
      return '<li><button type="button" data-id="' + esc(c.id) + '">' +
        '<span class="w-what">' + esc(typeLabel(c.request_type)) + (c.urgency === "urgent" ? ' <span class="pill urgent">Urgent</span>' : "") + "</span>" +
        '<span class="w-when">' + esc(relDay(d)) + ", " + esc(timeStr(d)) + "</span>" +
        '<span class="w-who">' + esc(c.caller_name || "Unknown caller") + (c.callback_number ? " on " + esc(prettyPhone(c.callback_number)) : "") + "</span>" +
        "</button></li>";
    }).join("");
  }
  $("waiting").addEventListener("click", function (e) { var b = e.target.closest("button[data-id]"); if (b) openCall(b.getAttribute("data-id")); });

  function buildTypeFilter() {
    var sel = $("f-type"), cur = sel.value, seen = {};
    state.calls.forEach(function (c) { if (c.request_type) seen[c.request_type] = true; });
    sel.innerHTML = '<option value="">All types</option>' + Object.keys(seen).sort(function (a, b) { return typeLabel(a).localeCompare(typeLabel(b)); })
      .map(function (t) { return '<option value="' + esc(t) + '">' + esc(typeLabel(t)) + "</option>"; }).join("");
    sel.value = seen[cur] ? cur : "";
  }

  function filtered() {
    var q = $("f-search").value.trim().toLowerCase(), t = $("f-type").value, u = $("f-urgency").value, s = $("f-status").value;
    return state.calls.filter(inPeriod).filter(function (c) {
      if (t && c.request_type !== t) return false;
      if (u && (c.urgency || "normal") !== u) return false;
      if (s === "waiting" && !isWaiting(c)) return false;
      if (s === "done" && !c.handled_at) return false;
      if (q) {
        var hay = [c.caller_name, c.caller_number, c.callback_number, prettyPhone(c.callback_number), c.reason, c.summary, typeLabel(c.request_type)].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function statusPill(c) {
    if (c.handled_at) return '<span class="pill done">Called back</span>';
    if (c.request_type === "sales_or_spam") return '<span class="pill">No action</span>';
    return '<span class="pill waiting">Waiting</span>';
  }

  function renderRows() {
    var rows = filtered(), tb = $("rows"), empty = $("log-empty");
    $("log-count").textContent = rows.length === 1 ? "1 call" : rows.length + " calls";
    if (!rows.length) {
      tb.innerHTML = "";
      empty.hidden = false;
      empty.innerHTML = state.calls.length
        ? "<p>No calls match these filters. Clear the search or choose a different period.</p>"
        : "<h2>No calls yet</h2><p>When a call rings out to your Keel Co line, it appears here within a minute of the caller hanging up.</p>";
      return;
    }
    empty.hidden = true;
    tb.innerHTML = rows.map(function (c) {
      var d = when(c);
      return '<tr tabindex="0" data-id="' + esc(c.id) + '">' +
        '<td class="when"><b>' + esc(timeStr(d)) + "</b>" + esc(relDay(d)) + "</td>" +
        '<td class="who"><b>' + esc(c.caller_name || "Unknown caller") + "</b><span>" + esc(prettyPhone(c.callback_number || c.caller_number) || "No number") + "</span></td>" +
        '<td class="why">' + esc(c.reason || c.summary || "") + "</td>" +
        '<td class="type">' + esc(typeLabel(c.request_type)) + (c.urgency === "urgent" ? ' <span class="pill urgent">Urgent</span>' : "") + "</td>" +
        '<td class="status">' + statusPill(c) + "</td></tr>";
    }).join("");
  }
  $("rows").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-id]"); if (tr) openCall(tr.getAttribute("data-id")); });
  $("rows").addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-id]")) { e.preventDefault(); openCall(e.target.getAttribute("data-id")); } });
  ["f-search", "f-type", "f-urgency", "f-status"].forEach(function (id) { $(id).addEventListener("input", renderRows); });

  document.querySelectorAll(".segmented button").forEach(function (b) {
    b.addEventListener("click", function () {
      state.period = b.getAttribute("data-period");
      document.querySelectorAll(".segmented button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render();
    });
  });

  // ---------- chart: calls per day, urgent stacked on other ----------
  function renderChart(calls) {
    var days = state.period === "7" ? 7 : 30, buckets = [], byKey = {};
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(Date.now() - i * 864e5), k = dayKey(d);
      var b = { key: k, date: d, urgent: 0, other: 0 }; buckets.push(b); byKey[k] = b;
    }
    calls.forEach(function (c) { var b = byKey[dayKey(when(c))]; if (!b) return; if (c.urgency === "urgent") b.urgent++; else b.other++; });
    var max = Math.max(4, Math.max.apply(null, buckets.map(function (b) { return b.urgent + b.other; })));
    var step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
    var top = Math.ceil(max / step) * step;
    var W = Math.max(280, $("chart").clientWidth || 640), H = 220, L = 30, R = 6, T = 8, B = 26, cw = (W - L - R) / buckets.length, bw = Math.max(4, Math.min(28, cw * 0.62));
    var y = function (v) { return T + (H - T - B) * (1 - v / top); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Calls per day for the last ' + days + ' days">';
    svg += '<g class="grid">';
    for (var v = 0; v <= top; v += step) svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
    svg += '</g><g class="axis">';
    for (v = 0; v <= top; v += step) svg += '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>";
    var every = buckets.length > 10 ? 5 : 1;
    buckets.forEach(function (b, i) {
      if ((buckets.length - 1 - i) % every === 0) svg += '<text x="' + (L + cw * i + cw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(buckets.length > 10 ? fmtDay.format(b.date).replace(/^\w+,?\s/, "") : fmtDay.format(b.date).split(",")[0].split(" ")[0]) + "</text>";
    });
    svg += "</g>";
    buckets.forEach(function (b, i) {
      var x = L + cw * i + (cw - bw) / 2, total = b.urgent + b.other, r = Math.min(4, bw / 2), base = y(0);
      svg += '<g class="col" tabindex="0" data-i="' + i + '" aria-label="' + esc(fmtDay.format(b.date)) + ": " + total + " calls, " + b.urgent + ' urgent">';
      svg += '<rect class="hit" x="' + (L + cw * i) + '" y="' + T + '" width="' + cw + '" height="' + (H - T - B) + '"/>';
      if (b.other) { var h1 = base - y(b.other); svg += roundedBar("bar", x, base - h1, bw, h1, b.urgent ? 0 : r, "var(--bar-other)"); }
      if (b.urgent) { var yo = y(b.other), h2 = yo - y(total) - (b.other ? 2 : 0); svg += roundedBar("bar", x, y(total), bw, Math.max(1, h2), r, "var(--bar-urgent)"); }
      svg += "</g>";
    });
    svg += "</svg>";
    var el = $("chart"); el.innerHTML = svg;
    var tip = $("chart-tip"), panel = el.parentElement;
    function showTip(g) {
      var b = buckets[+g.getAttribute("data-i")], total = b.urgent + b.other;
      tip.innerHTML = "<b>" + esc(fmtDay.format(b.date)) + "</b>" + total + (total === 1 ? " call" : " calls") + (b.urgent ? ", " + b.urgent + " urgent" : "");
      var gr = g.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      tip.style.left = (gr.left - pr.left + gr.width / 2) + "px";
      tip.style.top = (gr.top - pr.top + (gr.height * (1 - Math.min(1, total / top)))) + "px";
      tip.hidden = false;
    }
    el.querySelectorAll(".col").forEach(function (g) {
      g.addEventListener("mouseenter", function () { showTip(g); });
      g.addEventListener("focus", function () { showTip(g); });
      g.addEventListener("mouseleave", function () { tip.hidden = true; });
      g.addEventListener("blur", function () { tip.hidden = true; });
    });
  }
  var resizeT; window.addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(function () { if (state.clientId && state.calls) renderChart(state.calls.filter(inPeriod)); }, 150); });
  // A bar with rounded top corners only, anchored to the baseline.
  function roundedBar(cls, x, y, w, h, r, fill) {
    if (h <= 0) return "";
    r = Math.min(r, h, w / 2);
    var d = "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
    return '<path class="' + cls + '" d="' + d + '" fill="' + fill + '"/>';
  }

  // ---------- call detail drawer ----------
  var lastFocus = null;
  function openCall(id) {
    var c = state.calls.find(function (x) { return x.id === id; });
    if (!c) return;
    state.openId = id; lastFocus = document.activeElement;
    var d = when(c);
    $("d-title").textContent = typeLabel(c.request_type) + ": " + (c.caller_name || "Unknown caller");
    $("d-meta").textContent = fmtFull.format(d) + ". " + duration(c.duration_seconds) + ".";
    var pills = [];
    if (c.urgency === "urgent") pills.push('<span class="pill urgent">Urgent</span>');
    if (c.alert_sent_at) pills.push('<span class="pill">On-call texted</span>');
    if (isAfterHours(d)) pills.push('<span class="pill">After hours</span>');
    $("d-pills").innerHTML = pills.join("");
    setHandledButton(c);
    var cb = c.callback_number, facts = [
      ["Call back on", cb && /\d/.test(cb) ? '<a href="' + esc(telHref(cb)) + '">' + esc(prettyPhone(cb)) + "</a>" : esc(cb || "Not captured")],
      ["Called from", c.caller_number ? esc(prettyPhone(c.caller_number)) : "Number withheld"],
      ["Reason", esc(c.reason || "Not captured")],
      ["Status", c.handled_at ? "Called back " + esc(relDay(new Date(c.handled_at)).toLowerCase()) + " at " + esc(timeStr(new Date(c.handled_at))) + (c.handled_by ? " by " + esc(c.handled_by) : "") : (c.request_type === "sales_or_spam" ? "No action needed" : "Waiting for a call back")]
    ];
    $("d-facts").innerHTML = facts.map(function (f) { return "<div><dt>" + f[0] + "</dt><dd>" + f[1] + "</dd></div>"; }).join("");
    $("d-summary").textContent = c.summary || "No summary for this call.";
    $("d-unanswered-block").hidden = !c.unanswered_question;
    $("d-unanswered").textContent = c.unanswered_question || "";
    $("d-transcript").innerHTML = renderTranscript(c.transcript);
    $("scrim").hidden = false; var dr = $("drawer"); dr.hidden = false; dr.classList.remove("open"); void dr.offsetWidth; dr.classList.add("open");
    $("d-close").focus();
  }
  function renderTranscript(t) {
    if (!t) return '<p class="muted">The transcript for this call wasn’t saved. Calls from now on include it.</p>';
    return t.split(/\n+/).map(function (line) {
      var m = line.match(/^(Assistant|Caller|Agent|User):\s*(.*)$/);
      if (!m) return "";
      var ai = m[1] === "Assistant" || m[1] === "Agent";
      var text = m[2].replace(/\[[a-z ]+\]\s*/gi, "");
      return '<div class="bubble ' + (ai ? "ai" : "caller") + '"><small>' + (ai ? "Keel Co" : "Caller") + "</small>" + esc(text) + "</div>";
    }).join("");
  }
  function setHandledButton(c) {
    var b = $("d-handled");
    b.hidden = c.request_type === "sales_or_spam" && !c.handled_at;
    b.textContent = c.handled_at ? "Mark as waiting" : "Mark as called back";
    b.className = c.handled_at ? "btn btn-quiet" : "btn btn-primary";
  }
  function closeCall() {
    $("drawer").hidden = true; $("scrim").hidden = true; state.openId = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $("d-close").addEventListener("click", closeCall);
  $("scrim").addEventListener("click", closeCall);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("drawer").hidden) closeCall();
    if (e.key === "Tab" && !$("drawer").hidden) {
      var f = $("drawer").querySelectorAll("button:not([hidden]), a[href]"); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $("d-handled").addEventListener("click", function () {
    var c = state.calls.find(function (x) { return x.id === state.openId; }); if (!c) return;
    var b = $("d-handled"), mark = !c.handled_at; b.disabled = true;
    api("/rest/v1/rpc/mark_call_handled", { method: "POST", body: JSON.stringify({ p_call: c.id, p_handled: mark }) })
      .then(function (ts) {
        c.handled_at = mark ? (ts || new Date().toISOString()) : null;
        c.handled_by = mark ? session.email : null;
        render(); openCall(c.id);
        toast(mark ? "Marked as called back" : "Marked as waiting");
      })
      .catch(function () { toast("That didn’t save. Check your connection and try again."); })
      .finally(function () { b.disabled = false; });
  });

  // ---------- start ----------
  loadSession();
  var linked = new URLSearchParams(window.location.search).get("c");
  if (linked) { storeSet("keel.pending", linked); history.replaceState(null, "", window.location.pathname + window.location.hash); }
  var fromUrl = takeTokensFromUrl();
  if (fromUrl && fromUrl.error) {
    saveSession(null); show("view-login");
    var st = $("login-status"); st.className = "status err"; st.textContent = fromUrl.error;
  } else {
    if (fromUrl) saveSession(fromUrl);
    if (session) {
      validSession().then(loadApp).catch(function () { signOutLocal(); });
    } else {
      show("view-login");
    }
  }
  // Keep the log fresh while the page is open.
  setInterval(function () { if (session && state.clientId && document.visibilityState === "visible" && $("drawer").hidden) loadCalls().catch(function () {}); }, 60000);
})();
