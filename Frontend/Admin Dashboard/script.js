"use strict";

let users = [
  { id: "POL-1042", name: "Raman Sharma", role: "Police", unit: "Central Police Station", status: "Active" },
  { id: "FSL-2076", name: "Dr. Meera Nair", role: "FSL", unit: "Digital Forensics Division", status: "Active" },
  { id: "CRT-0312", name: "Justice A. Menon", role: "Court", unit: "District Court", status: "Active" },
  { id: "ADM-0001", name: "Portal Administrator", role: "Admin", unit: "System Administration", status: "Active" },
  { id: "POL-1098", name: "Inspector A. Khan", role: "Police", unit: "North Division", status: "Active" }
];
let departments = [
  { name: "Central Police Station", type: "Police unit", members: 18, cases: 42, state: "Connected" },
  { name: "North Division", type: "Police unit", members: 12, cases: 28, state: "Connected" },
  { name: "Digital Forensics Division", type: "FSL unit", members: 9, cases: 35, state: "Connected" },
  { name: "District Court", type: "Judicial unit", members: 7, cases: 64, state: "Connected" }
];
let evidence = [
  { id: "EV-2026-0042", file: "CCTV_entrance_01.mp4", caseId: "CR-2026-0184", role: "Police", status: "Awaiting SHO approval", date: "24 Oct 2026 · 10:42" },
  { id: "EV-2026-0041", file: "device_extraction.zip", caseId: "CR-2026-0181", role: "FSL", status: "At FSL", date: "24 Oct 2026 · 09:18" },
  { id: "EV-2026-0038", file: "statement_scan.pdf", caseId: "CR-2026-0176", role: "Court", status: "Verified", date: "23 Oct 2026 · 16:06" },
  { id: "EV-2026-0035", file: "mobile_image.E01", caseId: "CR-2026-0168", role: "Police", status: "Integrity alert", date: "23 Oct 2026 · 12:30" }
];
let cases = [];
let audit = [
  { action: "Evidence registered", actor: "POL-1042 · Raman Sharma", item: "EV-2026-0042 · CR-2026-0184", time: "24 Oct 2026 · 10:42", kind: "" },
  { action: "FSL receipt recorded", actor: "FSL-2076 · Dr. Meera Nair", item: "EV-2026-0041 · CR-2026-0181", time: "24 Oct 2026 · 09:18", kind: "" },
  { action: "Integrity exception raised", actor: "System monitor", item: "EV-2026-0035 · CR-2026-0168", time: "23 Oct 2026 · 12:30", kind: "alert" },
  { action: "Court evidence record viewed", actor: "CRT-0312 · Justice A. Menon", item: "CR-2026-0176", time: "23 Oct 2026 · 11:04", kind: "" }
];
const labels = { overview: "Overview", cases: "Case register", users: "Users & roles", departments: "Departments", evidence: "Evidence monitor", audit: "Audit logs", reports: "Reports" };
const view = document.querySelector("#view-container");
const current = document.querySelector("#dashboard-current");
const modalRoot = document.querySelector("#modal-root");
const toast = document.querySelector("#toast");
let activeView = "overview";
let search = "";
let timer;
let workspaceLoading = false;

function esc(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function notify(message) { toast.textContent = message; toast.classList.add("visible"); clearTimeout(timer); timer = setTimeout(() => toast.classList.remove("visible"), 3500); }
function statusClass(value) { return value === "Active" || value === "Connected" || value === "Verified" || value === "FSL approved" ? "status status-verified" : value === "At FSL" ? "status status-fsl" : value === "Integrity alert" ? "status status-alert" : value === "Inactive" ? "status status-alert" : "status status-pending"; }
function heading(kicker, title, desc, action = "") { return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${desc}</p></div>${action}</div>`; }

function renderOverview() {
  const alerts = evidence.filter((x) => x.status === "Integrity alert").length;
  const activeUsers = users.filter((x) => x.status === "Active").length;
  return `<section class="metric-grid"><article class="metric-card"><div class="metric-top"><span>Active Accounts</span><span class="metric-symbol"><i class="fa-solid fa-users"></i></span></div><div class="metric-value crimson-text-semibold">${activeUsers} Users</div><div class="metric-foot">Across all role types</div></article><article class="metric-card"><div class="metric-top"><span>Police Users</span><span class="metric-symbol"><i class="fa-solid fa-shield-halved"></i></span></div><div class="metric-value crimson-text-semibold">${users.filter((x) => x.role === "Police").length} Accounts</div><div class="metric-foot">Station and division access</div></article><article class="metric-card"><div class="metric-top"><span>Departments</span><span class="metric-symbol amber"><i class="fa-solid fa-building"></i></span></div><div class="metric-value crimson-text-semibold">${departments.length} Units</div><div class="metric-foot">Connected sample departments</div></article><article class="metric-card"><div class="metric-top"><span>Evidence Records</span><span class="metric-symbol green"><i class="fa-regular fa-folder-open"></i></span></div><div class="metric-value crimson-text-semibold">${evidence.length} Items</div><div class="metric-foot">Cross-role register</div></article><article class="metric-card"><div class="metric-top"><span>Integrity Alerts</span><span class="metric-symbol red"><i class="fa-solid fa-triangle-exclamation"></i></span></div><div class="metric-value crimson-text-semibold">${alerts} Open</div><div class="metric-foot"><span class="alert">Requires review</span></div></article></section>
    <div class="panel-grid"><section class="panel"><div class="panel-heading"><div><h2>Recent audit activity</h2><p>Latest actions across the portal</p></div><button class="text-btn" type="button" data-view="audit">Open audit log →</button></div><div class="timeline-list">${audit.slice(0, 4).map(auditRow).join("")}</div></section><section class="panel"><div class="panel-heading"><div><h2>Role distribution</h2><p>Active sample accounts</p></div></div><div class="panel-body">${["Police", "FSL", "Court", "Admin"].map((role) => `<div class="workflow-step"><span class="step-mark">${role.slice(0, 1)}</span><div><b>${role}</b><small>Assigned role accounts</small></div><span class="step-state">${users.filter((x) => x.role === role && x.status === "Active").length}</span></div>`).join("")}</div></section></div>`;
}

function renderUsers() {
  const rows = users.filter((x) => `${x.id} ${x.name} ${x.role} ${x.unit}`.toLowerCase().includes(search.toLowerCase()));
  return `${heading("ADMIN MODULE · IDENTITY & ACCESS", "Users and roles", "Review role assignments and account status across Police, FSL, Court and Admin.", `<button class="primary-btn" data-add-user type="button"><i class="fa-solid fa-user-plus"></i> Add user</button>`)}<section class="panel"><div class="panel-heading"><div><h2>Portal accounts</h2><p>${rows.length} accounts · shared directory</p></div></div><div class="table-tools"><label class="search-box">⌕<input id="user-search" value="${esc(search)}" placeholder="Search name, ID, role…" aria-label="Search users"></label><button class="secondary-btn" data-clear type="button">Clear</button></div><div class="table-wrap"><table><thead><tr><th>Employee ID</th><th>Name</th><th>Role</th><th>Unit</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows.map((x) => `<tr><td class="case-id">${esc(x.id)}</td><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${esc(x.unit)}</td><td><span class="${statusClass(x.status)}"><i></i>${esc(x.status)}</span></td><td><button class="row-actions" data-toggle-user="${esc(x.id)}" type="button">${x.status === "Active" ? "Disable" : "Enable"}</button></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty-state">No accounts match your search.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>Changes are saved to the shared portal directory.</span><span>Admin access</span></div></section>`;
}

function renderDepartments() {
  return `${heading("ADMIN MODULE · ORGANISATION", "Departments and units", "Review participating police, laboratory and judicial units and their sample workload.", `<button class="secondary-btn" data-add-department type="button"><i class="fa-solid fa-plus"></i> Add department</button>`)}<div class="case-grid">${departments.map((x) => `<article class="case-card"><div class="case-card-head"><span class="case-id">${esc(x.type)}</span><span class="${statusClass(x.state)}"><i></i>${esc(x.state)}</span></div><h2>${esc(x.name)}</h2><p>Role-based workspace access</p><div class="case-stats"><span>MEMBERS<b>${x.members}</b></span><span>LINKED CASES<b>${x.cases}</b></span></div></article>`).join("")}</div>`;
}

function renderEvidence() {
  const rows = evidence.filter((x) => `${x.id} ${x.file} ${x.caseId} ${x.role} ${x.status}`.toLowerCase().includes(search.toLowerCase()));
  return `${heading("ADMIN MODULE · CROSS-DEPARTMENT MONITORING", "Evidence monitor", "Read-only view of evidence movement and integrity status across all roles.")}
    <section class="panel"><div class="panel-heading"><div><h2>Evidence register</h2><p>${rows.length} cross-role sample records</p></div><span class="status status-fsl"><i></i>MONITORING</span></div><div class="table-tools"><label class="search-box">⌕<input id="evidence-search" value="${esc(search)}" placeholder="Search ID, file, case…" aria-label="Search evidence"></label><button class="secondary-btn" data-clear type="button">Clear</button></div><div class="table-wrap"><table><thead><tr><th>Evidence</th><th>Case ID</th><th>Last handled by</th><th>Updated</th><th>Status</th></tr></thead><tbody>${rows.map((x) => `<tr><td><div class="evidence-name"><b>${esc(x.file)}</b><small>${esc(x.id)}</small></div></td><td class="case-id">${esc(x.caseId)}</td><td>${esc(x.role)}</td><td>${esc(x.date)}</td><td><span class="${statusClass(x.status)}"><i></i>${esc(x.fslApproved ? "FSL approved" : x.status)}</span></td></tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">No records match your search.</div></td></tr>`}</tbody></table></div></section>`;
}

function renderCases() {
  const rows = cases.filter((x) => `${x.id} ${x.title} ${x.station} ${x.state}`.toLowerCase().includes(search.toLowerCase()));
  return `${heading("ADMIN MODULE · SHARED CASE REGISTER", "Case register", "Live case records created by Police and shared across FSL, Court and Admin.")}<section class="panel"><div class="panel-heading"><div><h2>All portal cases</h2><p>${rows.length} shared records · Updates appear from the central case register</p></div></div><div class="table-tools"><label class="search-box">⌕<input id="case-search" value="${esc(search)}" placeholder="Search case ID, title or station…" aria-label="Search cases"></label><button class="secondary-btn" data-clear type="button">Clear</button></div><div class="table-wrap"><table><thead><tr><th>Case ID</th><th>Case title</th><th>Police unit</th><th>Priority</th><th>Evidence</th><th>Status</th><th>Updated</th></tr></thead><tbody>${rows.map((x) => `<tr><td class="case-id">${esc(x.id)}</td><td>${esc(x.title)}</td><td>${esc(x.station)}</td><td>${esc(x.priority)}</td><td>${x.evidenceCount ?? x.evidence ?? 0}</td><td><span class="${statusClass(x.state)}"><i></i>${esc(x.state)}</span></td><td>${esc(x.updated)}</td></tr>`).join("") || `<tr><td colspan="7"><div class="empty-state">No cases match your search.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>${rows.length} case${rows.length === 1 ? "" : "s"}</span><span>Shared case register</span></div></section>`;
}

function auditRow(item) { return `<article class="timeline-item"><span class="timeline-dot ${item.kind || ""}"></span><div class="timeline-copy"><b>${esc(item.action)}</b><small>${esc(item.actor)} · ${esc(item.item)}</small></div><span class="timeline-time">${esc(item.time)}</span></article>`; }
function renderAudit() { return `${heading("ADMIN MODULE · ACCOUNTABILITY", "Audit logs", "Live system events and administrative actions from the shared custody ledger.")}<section class="panel"><div class="panel-heading"><div><h2>Live activity history</h2><p>Newest persisted events first · shared with Police, FSL and Court</p></div><span class="status status-fsl"><i></i>LIVE AUDIT</span></div><div class="timeline-list">${audit.length ? audit.map(auditRow).join("") : `<div class="empty-state">No audit activity has been recorded yet.</div>`}</div></section>`; }

function renderReports() {
  return `${heading("ADMIN MODULE · SYSTEM REPORTING", "Administration reports", "Export current snapshots for accounts, units and evidence monitoring.", `<button class="secondary-btn" data-export type="button"><i class="fa-solid fa-file-arrow-down"></i> Download CSV</button>`)}<section class="report-grid"><article class="report-card"><small>ACTIVE USERS</small><strong>${users.filter((x) => x.status === "Active").length}</strong><p>Accounts enabled in this workspace</p></article><article class="report-card"><small>DEPARTMENTS</small><strong>${departments.length}</strong><p>Participating units</p></article><article class="report-card"><small>OPEN INTEGRITY ALERTS</small><strong>${evidence.filter((x) => x.status === "Integrity alert").length}</strong><p>Evidence items flagged for review</p></article></section>`;
}

function render() {
  current.textContent = labels[activeView];
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView));
  view.innerHTML = ({ overview: renderOverview, cases: renderCases, users: renderUsers, departments: renderDepartments, evidence: renderEvidence, audit: renderAudit, reports: renderReports })[activeView]();
}

function openUserModal() {
  const departmentOptions = [...departments.map((department) => department.name), "System Administration"]
    .filter((name, index, names) => names.indexOf(name) === index)
    .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close><section class="modal" role="dialog" aria-modal="true" aria-labelledby="add-user-title"><div class="modal-head"><div><h2 id="add-user-title">Add portal user</h2><p>Create an account linked to a registered department.</p></div><button class="modal-close" data-close type="button" aria-label="Close">×</button></div><form class="modal-form" id="add-user-form"><label class="form-field">Full name<input name="name" required></label><label class="form-field">Employee ID<input name="id" required></label><label class="form-field">Role<select name="role"><option>Police</option><option>FSL</option><option>Court</option><option>Admin</option></select></label><label class="form-field">Department / unit<select name="unit" required><option value="" selected disabled>Select a department</option>${departmentOptions}</select></label><div class="modal-actions"><button class="secondary-btn" type="button" data-close>Cancel</button><button class="primary-btn" type="submit">Add user</button></div></form></section></div>`;
}

function openDepartmentModal() {
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close><section class="modal" role="dialog" aria-modal="true" aria-labelledby="add-department-title"><div class="modal-head"><div><h2 id="add-department-title">Add department</h2><p>Register a unit for portal records.</p></div><button class="modal-close" data-close type="button" aria-label="Close">×</button></div><form class="modal-form" id="add-department-form"><label class="form-field">Department name<input name="name" required minlength="3"></label><label class="form-field">Unit type<select name="type"><option>Police unit</option><option>FSL unit</option><option>Judicial unit</option><option>Administration</option></select></label><div class="modal-actions"><button class="secondary-btn" data-close type="button">Cancel</button><button class="primary-btn" type="submit">Add department</button></div></form></section></div>`;
}
function closeModal() { modalRoot.innerHTML = ""; }
function downloadReport() {
  const rows = [["Employee ID", "Name", "Role", "Unit", "Status"], ...users.map((x) => [x.id, x.name, x.role, x.unit, x.status])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "forensichain-admin-users-report.csv"; link.click(); URL.revokeObjectURL(url); notify("Sample administrator report downloaded.");
}

document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view; render(); }));
document.querySelector("#sign-out").addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); });
view.addEventListener("click", async (event) => {
  const button = event.target.closest("button"); if (!button) return;
  if (button.hasAttribute("data-add-user")) openUserModal();
  if (button.hasAttribute("data-add-department")) openDepartmentModal();
  if (button.dataset.view) { activeView = button.dataset.view; render(); }
  if (button.dataset.toggleUser) {
    const user = users.find((x) => x.id === button.dataset.toggleUser);
    if (user) { const status = user.status === "Active" ? "Inactive" : "Active"; try { const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); await loadAdminWorkspace(); notify(`${user.id} marked ${status.toLowerCase()}.`); } catch (error) { notify(error.message); } }
  }
  if (button.hasAttribute("data-export")) downloadReport();
  if (button.hasAttribute("data-clear")) { search = ""; render(); }
});
view.addEventListener("input", (event) => {
  if (!new Set(["user-search", "evidence-search", "case-search"]).has(event.target.id)) return;
  search = event.target.value; const caret = event.target.selectionStart; render(); const input = document.getElementById(event.target.id); input.focus(); input.setSelectionRange(caret, caret);
});
modalRoot.addEventListener("click", (event) => { if (event.target.hasAttribute("data-close")) closeModal(); });
modalRoot.addEventListener("submit", async (event) => {
  if (event.target.id === "add-department-form") {
    event.preventDefault(); const form = new FormData(event.target);
    try {
      const response = await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), type: form.get("type") }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      closeModal(); await loadAdminWorkspace(); activeView = "departments"; render(); notify(`${result.department.name} added to departments.`);
    } catch (error) { notify(error.message); }
    return;
  }
  if (event.target.id !== "add-user-form") return;
  event.preventDefault(); const formData = new FormData(event.target);
  const id = String(formData.get("id")).trim().toUpperCase();
  try {
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: id, name: String(formData.get("name")).trim(), role: String(formData.get("role")), unit: String(formData.get("unit")).trim() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    closeModal(); await loadAdminWorkspace(); activeView = "users"; render(); notify(`${id} created. Temporary password: ${result.temporaryPassword}`);
  } catch (error) { notify(error.message); }
});
async function loadAdminWorkspace() {
  if (workspaceLoading) return;
  workspaceLoading = true;
  try {
    const me = await fetch("/api/auth/me").then(async (r) => { if (!r.ok) throw Error(); return r.json(); });
    if (me.user.role !== "Admin") { window.location.assign("/dashboard"); return; }
    const [u,d,e,a,c] = await Promise.all(["/api/users","/api/departments","/api/evidence","/api/audit","/api/cases"].map((url) => fetch(url).then(async (r) => { if (!r.ok) throw Error(); return r.json(); })));
    users = u.users.map((x) => ({ ...x, id: x.employeeId }));
    departments = d.departments.map((x) => ({ ...x, state: x.status }));
    evidence = e.evidence.map((x) => ({ ...x, file: x.name, date: x.added, role: x.officer }));
    audit = a.events;
    cases = c.cases;
    render();
  } catch { window.location.assign("/"); }
  finally { workspaceLoading = false; }
}
loadAdminWorkspace();
window.setInterval(() => {
  if (document.visibilityState === "visible" && !modalRoot.childElementCount) loadAdminWorkspace();
}, 15000);
