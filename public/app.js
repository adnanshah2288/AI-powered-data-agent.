const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PATHS = {
  db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'
};
const ic = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[n]}</svg>`;
const when = d => new Date(d).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const clock = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

let token = localStorage.getItem("token") || sessionStorage.getItem("token");
const S = { view: "dashboard", mode: "login", projects: [], tables: [], project: null, table: null, rows: [],
  editId: null, chatTable: null, msgs: {}, last: null, tab: "data", search: "", cols: [], tname: "", t0: Date.now() };

/* ---------- api and helpers ---------- */
async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, { method, headers: { "Content-Type": "application/json", Authorization: token || "" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Please check your input and try again");
  return data;
}
function toast(m) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = m;
  (document.querySelector("dialog[open]") || document.body).appendChild(t); setTimeout(() => t.remove(), 4000);
}
function modal(html) { const d = $("#modal"); d.innerHTML = `<div class="modal">${html}</div>`; if (!d.open) d.showModal(); }

/* ---------- login ---------- */
function viewAuth() {
  const up = S.mode === "signup";
  $("#root").innerHTML = `
    <div class="auth"><form class="auth-card" id="auth-form">
      <h1>${up ? "Create your account" : "Welcome back"}</h1>
      <p class="muted">${up ? "Sign up to get started" : "Sign in to continue"}</p>
      <label>Email address<div class="field">${ic("mail")}<input id="email" type="email" placeholder="you@example.com" required></div></label>
      <label>Password<div class="field">${ic("lock")}<input id="password" type="password" placeholder="Enter your password" required>
        <button type="button" class="icon-btn" id="toggle-pw" title="Show password">${ic("eye")}</button></div></label>
      ${up ? "" : `<label class="check"><input type="checkbox" id="remember"> Remember me</label>`}
      <button class="btn dark wide" type="submit">${up ? "Create account" : "Sign in"}</button>
      <div class="or"><span>or</span></div>
      <button type="button" class="btn wide" id="switch-mode">${up ? "Back to sign in" : "Create an account"}</button>
      <p class="error" id="auth-error"></p>
    </form></div>`;
  $("#toggle-pw").onclick = () => { const p = $("#password"); p.type = p.type === "password" ? "text" : "password"; };
  $("#switch-mode").onclick = () => { S.mode = up ? "login" : "signup"; viewAuth(); };
  $("#auth-form").onsubmit = async e => {
    e.preventDefault();
    try {
      const d = await api(up ? "/signup" : "/login", "POST", { email: $("#email").value.trim(), password: $("#password").value });
      token = d.token;
      ((up || $("#remember").checked) ? localStorage : sessionStorage).setItem("token", token);
      await boot();
    } catch (err) { $("#auth-error").textContent = err.message; }
  };
}

/* ---------- shell and routing ---------- */
function shell() {
  $("#root").innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="logo">${ic("db", 28)}</div>
        <nav>
          <button class="nav" data-nav="dashboard">${ic("home")} Dashboard</button>
          <button class="nav" data-nav="chat">${ic("message")} Chat</button>
        </nav>
        <div class="status"><i></i><div><b>System online</b><span>Ready to help</span></div></div>
      </aside>
      <div><header class="topbar"><button class="btn small" data-act="logout">${ic("user", 16)} Log out</button></header><main id="main"></main></div>
    </div>`;
}
async function load() {
  const [p, t] = await Promise.all([api("/projects"), api("/databases")]);
  S.projects = p; S.tables = t.filter(x => x.project_id);
  if (!p.some(x => x.id === S.project)) S.project = p.length ? p[0].id : null;
}
async function boot() { if (token) { try { await load(); } catch (e) { return; } } render(); }
function render() {
  if (!token) return viewAuth();
  if (!$(".shell")) shell();
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.nav === (S.view === "chat" ? "chat" : "dashboard")));
  ({ dashboard: viewDashboard, table: viewTable, chat: viewChat })[S.view]();
}
function logout() {
  token = null; localStorage.removeItem("token"); sessionStorage.removeItem("token");
  Object.assign(S, { view: "dashboard", msgs: {}, last: null, table: null }); render();
}

/* ---------- dashboard ---------- */
function projRows() {
  const q = S.search.toLowerCase(), list = S.projects.filter(p => p.name.toLowerCase().includes(q));
  if (!list.length) return `<div class="empty">${S.projects.length ? "No databases match your search." : "No databases yet. Create your first one to get started."}</div>`;
  return `<div class="scroll"><table class="tbl"><thead><tr><th>Name</th><th>Created at</th><th>Tables</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr class="${p.id === S.project ? "sel" : ""}">
      <td><div class="name">${ic("db", 22)}<div>${esc(p.name)}<small>${esc(p.description)}</small></div></div></td>
      <td>${when(p.created_at)}</td><td>${S.tables.filter(t => t.project_id === p.id).length}</td>
      <td><div class="acts"><button class="btn small" data-act="view-tables" data-id="${p.id}">${ic("table", 15)} View tables</button>
      <button class="btn small danger" data-act="del-project" data-id="${p.id}" title="Delete database">${ic("trash", 15)}</button></div></td></tr>`).join("")}
    </tbody></table></div>`;
}
function viewDashboard() {
  const cur = S.projects.find(p => p.id === S.project), tabs = S.tables.filter(t => t.project_id === S.project);
  const stat = (i, l, v) => `<div class="card stat">${ic(i, 22)}<span class="muted">${l}</span><b>${v.toLocaleString()}</b></div>`;
  $("#main").innerHTML = `
    <div class="head"><div><h1>Database dashboard</h1><p class="muted">Manage your databases, tables and data</p></div>
      <button class="btn dark" data-act="new-project">${ic("plus", 16)} Create database</button></div>
    <div class="stats">${stat("db", "Total databases", S.projects.length)}${stat("table", "Total tables", S.tables.length)}
      ${stat("list", "Total columns", S.tables.reduce((n, t) => n + t.columns.length, 0))}${stat("file", "Total rows", S.tables.reduce((n, t) => n + t.row_count, 0))}</div>
    <div class="sec"><h2>Your databases</h2><input id="search" placeholder="Search databases..." value="${esc(S.search)}"></div>
    <div class="card list" id="proj-rows">${projRows()}</div>
    ${cur ? `<div class="card"><div class="sec pad"><h2 class="name">${ic("db", 20)} Tables in ${esc(cur.name)}</h2>
      <button class="btn small" data-act="new-table">${ic("plus", 15)} Create table</button></div>
      ${tabs.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Table name</th><th>Columns</th><th>Rows</th><th>Created at</th><th></th></tr></thead><tbody>
      ${tabs.map(t => `<tr><td><div class="name">${ic("table", 18)}${esc(t.name)}</div></td><td>${t.columns.length}</td><td>${t.row_count}</td><td>${when(t.created_at)}</td>
        <td><div class="acts"><button class="btn small" data-act="open-table" data-id="${t.id}">${ic("eye", 15)} View</button>
        <button class="btn small danger" data-act="del-table" data-id="${t.id}" title="Delete table">${ic("trash", 15)}</button></div></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">No tables yet. Create a table to start adding data.</div>`}</div>` : ""}`;
}
function tableModal() {
  modal(`<h2>Create table</h2><p class="muted">Choose the columns you want to store.</p>
    <label>Table name<input id="t-name" value="${esc(S.tname)}" placeholder="For example: employees"></label>
    <label>Columns</label>
    ${S.cols.map((c, i) => `<div class="colrow"><input class="c-name" value="${esc(c.name)}" placeholder="Column name">
      <select class="c-type"><option value="text" ${c.type === "text" ? "selected" : ""}>Text</option><option value="number" ${c.type === "number" ? "selected" : ""}>Number</option></select>
      <button class="btn small" data-act="rm-col" data-i="${i}" ${S.cols.length === 1 ? "disabled" : ""}>Remove</button></div>`).join("")}
    <div class="modal-actions"><button class="btn" data-act="add-col">${ic("plus", 15)} Add column</button>
      <span style="display:flex;gap:8px"><button class="btn" data-act="close">Cancel</button><button class="btn dark" data-act="make-table">Create table</button></span></div>`);
}
function syncCols() {
  S.tname = $("#t-name").value;
  S.cols = [...document.querySelectorAll(".colrow")].map(r => ({ name: r.querySelector(".c-name").value, type: r.querySelector(".c-type").value }));
}

/* ---------- table data entry ---------- */
async function openTable(id) {
  S.table = S.tables.find(t => t.id === id); S.editId = null; S.rows = await api(`/databases/${id}/records`); S.view = "table"; render();
}
function viewTable() {
  const t = S.table;
  $("#main").innerHTML = `
    <button class="btn small" data-act="back">&larr; Back to dashboard</button>
    <div class="head" style="margin-top:16px"><div><h1>${esc(t.name)}</h1><p class="muted">Add, edit or delete records. The AI chat always reads the latest data.</p></div>
      <button class="btn dark" data-act="goto-chat" data-id="${t.id}">${ic("message", 16)} Ask AI about this table</button></div>
    <div class="card"><div class="form">${t.columns.map(c => `<label>${esc(c.name)}<input data-col="${esc(c.name)}" type="${c.type === "number" ? "number" : "text"}" step="any"></label>`).join("")}</div>
      <div class="formbar"><button class="btn dark" id="save-btn" data-act="save">Add record</button><button class="btn" id="cancel-btn" data-act="cancel" hidden>Cancel</button></div></div>
    <div class="card" style="margin-top:16px" id="rows-card"></div>`;
  drawRows();
}
function drawRows() {
  const cols = S.table.columns;
  $("#rows-card").innerHTML = S.rows.length ? `<div class="scroll"><table class="tbl"><thead><tr>${cols.map(c => `<th>${esc(c.name)}</th>`).join("")}<th></th></tr></thead><tbody>
    ${S.rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c.name])}</td>`).join("")}<td><div class="acts">
      <button class="btn small" data-act="edit" data-id="${r.id}">Edit</button><button class="btn small danger" data-act="del" data-id="${r.id}">Delete</button></div></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">No records yet. Fill in the fields above and choose Add record.</div>`;
}
function resetForm() {
  S.editId = null; document.querySelectorAll(".form [data-col]").forEach(i => i.value = "");
  $("#save-btn").textContent = "Add record"; $("#cancel-btn").hidden = true;
}

/* ---------- chat ---------- */
function viewChat() {
  if (!S.tables.length) { $("#main").innerHTML = `<h1>Chat</h1><p class="muted">Create a table with some data on the dashboard first, then come back to ask questions.</p>`; return; }
  if (!S.tables.some(t => t.id === S.chatTable)) S.chatTable = S.tables[0].id;
  const pn = id => (S.projects.find(p => p.id === id) || {}).name;
  $("#main").innerHTML = `
    <div class="chatwrap">
      <section class="chat">
        <div class="chat-top"><label style="margin:0">Asking about<select id="chat-table">
          ${S.tables.map(t => `<option value="${t.id}" ${t.id === S.chatTable ? "selected" : ""}>${esc(pn(t.project_id))} / ${esc(t.name)}</option>`).join("")}</select></label></div>
        <div id="msgs"></div>
        <div class="askbar"><input id="q" placeholder="Ask anything about your data..."><button class="btn dark" data-act="send" title="Send">${ic("send")}</button></div>
      </section>
      <section class="card panel"><div class="tabs">
        ${[["data", "table", "Data"], ["chart", "chart", "Chart"], ["sql", "code", "SQL"]].map(([k, i, l]) => `<button class="tab" data-act="tab" data-tab="${k}">${ic(i, 16)} ${l}</button>`).join("")}
      </div><div class="pbody" id="pbody"></div></section>
    </div>`;
  drawMsgs(); drawPanel();
}
function drawMsgs() {
  const m = S.msgs[S.chatTable] || [{ who: "ai", time: S.t0, text: "Ask me anything about this table. I read the latest records every time, so new data shows up in my answers straight away." }];
  $("#msgs").innerHTML = m.map(x => `<div class="msg ${x.who}">${esc(x.text)}</div><div class="time ${x.who}">${clock(x.time)}</div>`).join("");
  $("#msgs").scrollTop = $("#msgs").scrollHeight;
}
function chart(r) {
  const cols = r.columns, vk = cols[cols.length - 1], vals = r.rows.map(x => Number(x[vk]));
  if (cols.length < 2 || !vals.length || vals.some(isNaN)) return `<p class="muted">This result has no numbers to chart. Try a question such as "average salary per department".</p>`;
  const max = Math.max(...vals, 1);
  return `<h2 style="margin-bottom:8px">${esc(vk)}</h2><div class="bars">${vals.map(v => `<div class="bar"><span class="val">${v.toLocaleString()}</span><div class="fill" style="height:${Math.max(v / max * 80, 2)}%"></div></div>`).join("")}</div>
    <div class="labs">${r.rows.map(x => `<span>${esc(x[cols[0]])}</span>`).join("")}</div>`;
}
function drawPanel() {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === S.tab));
  const r = S.last; let h;
  if (!r) h = `<p class="muted">Results appear here after you ask a question. See them as a table, a chart, or the SQL that was run.</p>`;
  else if (!r.sql) h = `<p class="muted">That answer did not need to read any records.</p>`;
  else if (S.tab === "sql") h = `<pre class="sql">${esc(r.sql)}</pre>`;
  else if (S.tab === "chart") h = chart(r);
  else h = `<h2>Result</h2><p class="muted" style="margin:4px 0 16px">${esc(r.question)}</p>` + (r.rows.length
    ? `<div class="scroll"><table class="tbl"><thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
      ${r.rows.map(x => `<tr>${r.columns.map(c => `<td>${esc(x[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="muted">No matching records.</p>`);
  $("#pbody").innerHTML = h;
}
async function ask() {
  const inp = $("#q"), q = inp.value.trim(); if (!q) return;
  const m = S.msgs[S.chatTable] = S.msgs[S.chatTable] || [], wait = { who: "ai", time: Date.now(), text: "Checking your records..." };
  m.push({ who: "user", time: Date.now(), text: q }, wait); inp.value = ""; drawMsgs();
  try { const r = await api(`/databases/${S.chatTable}/chat`, "POST", { question: q }); wait.text = r.answer; S.last = { ...r, question: q }; S.tab = "data"; }
  catch (e) { wait.text = "Something went wrong: " + e.message; }
  drawMsgs(); drawPanel();
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  try {
    const nav = e.target.closest("[data-nav]");
    if (nav) { S.view = nav.dataset.nav; if (S.view === "dashboard") await load(); return render(); }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, id = Number(b.dataset.id);
    if (act === "logout") return logout();
    if (act === "close") return $("#modal").close();
    if (act === "new-project") return modal(`<h2>Create database</h2><p class="muted">A database groups your related tables.</p>
      <label>Name<input id="p-name" placeholder="For example: Company data"></label><label>Description<input id="p-desc" placeholder="Optional"></label>
      <div class="modal-actions"><span></span><span style="display:flex;gap:8px"><button class="btn" data-act="close">Cancel</button><button class="btn dark" data-act="make-project">Create</button></span></div>`);
    if (act === "make-project") {
      const r = await api("/projects", "POST", { name: $("#p-name").value, description: $("#p-desc").value });
      $("#modal").close(); S.project = r.id; await load(); return render();
    }
    if (act === "view-tables") { S.project = id; return viewDashboard(); }
    if (act === "del-project") { if (!confirm("Delete this database and all of its tables and records?")) return; await api(`/projects/${id}`, "DELETE"); await load(); return render(); }
    if (act === "new-table") { S.cols = [{ name: "", type: "text" }]; S.tname = ""; return tableModal(); }
    if (act === "add-col") { syncCols(); S.cols.push({ name: "", type: "text" }); return tableModal(); }
    if (act === "rm-col") { syncCols(); S.cols.splice(Number(b.dataset.i), 1); return tableModal(); }
    if (act === "make-table") {
      syncCols(); await api("/databases", "POST", { name: S.tname, columns: S.cols, project_id: S.project });
      $("#modal").close(); await load(); return render();
    }
    if (act === "open-table") return openTable(id);
    if (act === "del-table") { if (!confirm("Delete this table and all of its records?")) return; await api(`/databases/${id}`, "DELETE"); await load(); return render(); }
    if (act === "back") { S.view = "dashboard"; await load(); return render(); }
    if (act === "goto-chat") { S.chatTable = id; S.last = null; S.view = "chat"; return render(); }
    if (act === "save") {
      const data = {}; document.querySelectorAll(".form [data-col]").forEach(i => data[i.dataset.col] = i.value);
      const path = `/databases/${S.table.id}/records`;
      if (S.editId) await api(`${path}/${S.editId}`, "PUT", { data }); else await api(path, "POST", { data });
      resetForm(); S.rows = await api(path); return drawRows();
    }
    if (act === "cancel") return resetForm();
    if (act === "edit") {
      const r = S.rows.find(x => x.id === id); S.editId = id;
      document.querySelectorAll(".form [data-col]").forEach(i => i.value = r[i.dataset.col] ?? "");
      $("#save-btn").textContent = "Save changes"; $("#cancel-btn").hidden = false; return window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (act === "del") { if (!confirm("Delete this record?")) return; await api(`/databases/${S.table.id}/records/${id}`, "DELETE"); S.rows = await api(`/databases/${S.table.id}/records`); return drawRows(); }
    if (act === "send") return ask();
    if (act === "tab") { S.tab = b.dataset.tab; return drawPanel(); }
  } catch (err) { toast(err.message); }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "q") ask(); });
document.addEventListener("input", e => { if (e.target.id === "search") { S.search = e.target.value; $("#proj-rows").innerHTML = projRows(); } });
document.addEventListener("change", e => { if (e.target.id === "chat-table") { S.chatTable = Number(e.target.value); S.last = null; drawMsgs(); drawPanel(); } });

boot();
