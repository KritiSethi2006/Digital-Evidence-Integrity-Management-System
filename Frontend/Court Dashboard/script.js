"use strict";

let evidence = [
  { id: "EV-2026-0042", name: "CCTV_entrance_01.mp4", caseId: "CR-2026-0184", type: "Video", submittedBy: "Central Police Station", submitted: "24 Oct 2026 · 10:42", status: "Awaiting SHO approval", hash: "3b7c4e2a…a91d0f6c", sealed: "Seal recorded" },
  { id: "EV-2026-0041", name: "device_extraction.zip", caseId: "CR-2026-0181", type: "Archive", submittedBy: "North Division", submitted: "24 Oct 2026 · 09:18", status: "At FSL", hash: "8f0d2b61…6c34bb10", sealed: "Seal recorded" },
  { id: "EV-2026-0038", name: "statement_scan.pdf", caseId: "CR-2026-0176", type: "Document", submittedBy: "Central Police Station", submitted: "23 Oct 2026 · 16:06", status: "Verified", hash: "da19a4ce…902fe711", sealed: "Seal verified" },
  { id: "EV-2026-0035", name: "mobile_image.E01", caseId: "CR-2026-0168", type: "Forensic image", submittedBy: "South Division", submitted: "23 Oct 2026 · 12:30", status: "Integrity alert", hash: "Mismatch detected", sealed: "Review required" }
];
let cases = [
  { id: "CR-2026-0184", title: "Unauthorised access investigation", court: "Courtroom 2", status: "Evidence submitted", hearing: "28 Oct 2026", evidence: 1 },
  { id: "CR-2026-0181", title: "Digital device examination", court: "Courtroom 1", status: "Forensic examination", hearing: "30 Oct 2026", evidence: 1 },
  { id: "CR-2026-0176", title: "Witness statement record", court: "Courtroom 3", status: "Evidence verified", hearing: "02 Nov 2026", evidence: 1 },
  { id: "CR-2026-0168", title: "Mobile device integrity review", court: "Courtroom 2", status: "Integrity review", hearing: "04 Nov 2026", evidence: 1 }
];
const labels = { overview: "Overview", docket: "Case docket", evidence: "Evidence", custody: "Custody records", reports: "Reports" };
const view = document.querySelector("#view-container");
const title = document.querySelector("#dashboard-current");
const modalRoot = document.querySelector("#modal-root");
const toast = document.querySelector("#toast");
let activeView = "overview";
let search = "";
let auditEvents = [];
let timer;
let workspaceLoading = false;

function esc(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function notify(message) { toast.textContent = message; toast.classList.add("visible"); clearTimeout(timer); timer = setTimeout(() => toast.classList.remove("visible"), 3500); }
function statusClass(status) { if (status === "Verified" || status === "FSL approved") return "status status-verified"; if (status === "At FSL") return "status status-fsl"; if (status === "Integrity alert") return "status status-alert"; return "status status-pending"; }
function heading(kicker, name, description, action = "") { return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${name}</h1><p>${description}</p></div>${action}</div>`; }

function evidenceRows(rows) {
  if (!rows.length) return `<tr><td colspan="6"><div class="empty-state">No evidence records match this search.</div></td></tr>`;
  return rows.map((item) => `<tr><td><div class="evidence-name"><b>${esc(item.name)}</b><small>${esc(item.id)} · ${esc(item.type)}</small></div></td><td><span class="case-id">${esc(item.caseId)}</span></td><td>${esc(item.submittedBy)}</td><td>${esc(item.submitted)}</td><td><span class="${statusClass(item.status)}"><i></i>${esc(item.fslApproved ? "FSL approved" : item.status)}</span></td><td><button class="row-actions" data-evidence="${esc(item.id)}" type="button">Review</button></td></tr>`).join("");
}
function evidenceTable(rows, compact = false) {
  return `<section class="panel"><div class="panel-heading"><div><h2>${compact ? "Recently submitted evidence" : "Evidence filed in cases"}</h2><p>${compact ? "Latest records in the judicial workspace" : `${rows.length} read-only records · Select a record for hash and custody details`}</p></div>${compact ? `<button class="text-btn" data-view="evidence" type="button">View evidence →</button>` : ""}</div>${compact ? "" : `<div class="table-tools"><label class="search-box">⌕<input id="evidence-search" value="${esc(search)}" placeholder="Search evidence or case…" aria-label="Search evidence"></label><button class="secondary-btn" data-clear type="button">Clear</button></div>`}<div class="table-wrap"><table><thead><tr><th>Evidence</th><th>Case ID</th><th>Submitted by</th><th>Date filed</th><th>Custody status</th><th></th></tr></thead><tbody>${evidenceRows(rows)}</tbody></table></div><div class="table-footer"><span>${rows.length} record${rows.length === 1 ? "" : "s"}</span><span>READ ONLY · SAMPLE DATA</span></div></section>`;
}
function caseCards() {
  return `<div class="case-grid">${cases.map((item) => `<article class="case-card"><div class="case-card-head"><span class="case-id">${esc(item.id)}</span><span class="case-priority">${esc(item.status)}</span></div><h2>${esc(item.title)}</h2><p>${esc(item.court)}</p><div class="case-stats"><span>NEXT HEARING<b>${esc(item.hearing)}</b></span><span>FILED EVIDENCE<b>${item.evidence} record</b></span></div><button class="text-btn" type="button" data-case="${esc(item.id)}">Review case record →</button></article>`).join("")}</div>`;
}

function renderOverview() {
  const verified = evidence.filter((x) => x.status === "Verified").length;
  const alerts = evidence.filter((x) => x.status === "Integrity alert").length;
  return `<section class="metric-grid"><article class="metric-card"><div class="metric-top"><span>Active Cases</span><span class="metric-symbol"><i class="fa-solid fa-book-bookmark"></i></span></div><div class="metric-value crimson-text-semibold">${cases.length} Listed</div><div class="metric-foot">In this judicial workspace</div></article><article class="metric-card"><div class="metric-top"><span>Evidence Records</span><span class="metric-symbol"><i class="fa-regular fa-folder-open"></i></span></div><div class="metric-value crimson-text-semibold">${evidence.length} Submitted</div><div class="metric-foot">Linked to listed cases</div></article><article class="metric-card"><div class="metric-top"><span>FSL Verified</span><span class="metric-symbol green"><i class="fa-solid fa-check"></i></span></div><div class="metric-value crimson-text-semibold">${verified} Records</div><div class="metric-foot">Integrity check recorded</div></article><article class="metric-card"><div class="metric-top"><span>Integrity Flags</span><span class="metric-symbol red"><i class="fa-solid fa-triangle-exclamation"></i></span></div><div class="metric-value crimson-text-semibold">${alerts} Review</div><div class="metric-foot"><span class="alert">Requires judicial attention</span></div></article></section>
    <div class="panel-grid">${evidenceTable(evidence.slice(0, 4), true)}</div>`;
}
function renderDocket() { return `${heading("COURT MODULE · CASE DOCKET", "Case docket", "Review case status, scheduled hearings and evidence filed for judicial consideration.")}${caseCards()}`; }
function renderEvidence() { const rows = evidence.filter((x) => `${x.id} ${x.name} ${x.caseId} ${x.submittedBy}`.toLowerCase().includes(search.toLowerCase())); return `${heading("COURT MODULE · FILED MATERIAL", "Evidence register", "Inspect filed evidence and integrity metadata. Records are read-only.")}${evidenceTable(rows)}`; }
function renderCustody() {
  return `${heading("COURT MODULE · EVIDENCE HISTORY", "Chain of custody records", "Live, read-only view of the same custody ledger used by Police and FSL.")}<section class="panel"><div class="panel-heading"><div><h2>Live custody timeline</h2><p>Shared audit events · judicial read-only view</p></div><span class="status status-fsl"><i></i>LIVE READ ONLY</span></div><div class="timeline-list">${auditEvents.length ? auditEvents.map((event) => {
    const item = evidence.find((row) => row.id === event.evidenceId);
    const evidenceLabel = item ? `${item.id} · ${item.name}` : (event.item || "Case activity");
    return `<article class="timeline-item"><span class="timeline-dot ${event.kind || ""}"></span><div class="timeline-copy"><b>${esc(event.action)}${event.evidenceId ? ` · ${esc(event.evidenceId)}` : ""}</b><small>${esc(evidenceLabel)} · ${esc(event.actor || "Portal system")}${event.caseId ? ` · Case ${esc(event.caseId)}` : ""}</small></div><span class="timeline-time">${esc(event.time)}</span></article>`;
  }).join("") : `<div class="empty-state">No custody activity has been recorded yet.</div>`}</div></section>`;
}
function renderReports() {
  const verified = evidence.filter((x) => x.status === "Verified").length;
  const alerts = evidence.filter((x) => x.status === "Integrity alert").length;
  return `${heading("COURT MODULE · DOCUMENTS", "Evidence and custody reports", "Export a read-only summary for judicial review.", `<button class="secondary-btn" data-export type="button"><i class="fa-solid fa-file-arrow-down"></i> Download CSV</button>`)}<section class="report-grid"><article class="report-card"><small>CASE FILES</small><strong>${cases.length}</strong><p>Cases listed in this sample docket</p></article><article class="report-card"><small>VERIFIED RECORDS</small><strong>${verified}</strong><p>Evidence with FSL hash verification</p></article><article class="report-card"><small>INTEGRITY FLAGS</small><strong>${alerts}</strong><p>Records requiring review</p></article></section>`;
}

function render() {
  title.textContent = labels[activeView];
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView));
  view.innerHTML = ({ overview: renderOverview, docket: renderDocket, evidence: renderEvidence, custody: renderCustody, reports: renderReports })[activeView]();
}
function openDetail(id) {
  const item = evidence.find((x) => x.id === id); if (!item) return;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close><section class="modal" role="dialog" aria-modal="true" aria-labelledby="record-title"><div class="modal-head"><div><h2 id="record-title">${esc(item.id)}</h2><p>${esc(item.name)} · Case ${esc(item.caseId)}</p></div><button class="modal-close" data-close type="button" aria-label="Close">×</button></div><div class="modal-form"><span class="${statusClass(item.status)}"><i></i>${esc(item.fslApproved ? "FSL approved" : item.status)}</span>${item.fslReport ? `<label class="form-field">FSL examination report<textarea readonly>${esc(item.fslReport)}</textarea></label>` : ""}<label class="form-field">Recorded SHA-256<input value="${esc(item.hash)}" readonly></label><label class="form-field">Seal status<input value="${esc(item.sealed)}" readonly></label><p class="form-help">Submitted by ${esc(item.submittedBy)} · ${esc(item.submitted)}</p><p class="form-help">Read-only record. Contact the submitting unit for corrections.</p></div></section></div>`;
}
function openCase(id) {
  const item = cases.find((x) => x.id === id); if (!item) return;
  const linked = evidence.filter((x) => x.caseId === id);
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close><section class="modal" role="dialog" aria-modal="true" aria-labelledby="case-title"><div class="modal-head"><div><h2 id="case-title">${esc(item.id)}</h2><p>${esc(item.title)}</p></div><button class="modal-close" data-close type="button" aria-label="Close">×</button></div><div class="modal-form"><label class="form-field">Case status<input value="${esc(item.status)}" readonly></label><label class="form-field">Next hearing<input value="${esc(item.hearing)} · ${esc(item.court)}" readonly></label><b>Linked evidence</b>${linked.length ? linked.map((x) => `<button type="button" class="secondary-btn" data-evidence="${esc(x.id)}">${esc(x.id)} · ${esc(x.name)}</button>`).join("") : `<p class="form-help">No sample evidence linked.</p>`}</div></section></div>`;
}
function downloadReport() {
  const rows = [["Evidence ID", "File", "Case ID", "Type", "Submitted by", "Custody status", "SHA-256", "Seal"], ...evidence.map((x) => [x.id, x.name, x.caseId, x.type, x.submittedBy, x.status, x.hash, x.sealed])];
  const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "forensichain-court-evidence-report.csv"; link.click(); URL.revokeObjectURL(url); notify("Read-only sample report downloaded.");
}
function closeModal() { modalRoot.innerHTML = ""; }

document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view; render(); }));
document.querySelector("#sign-out").addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); });
view.addEventListener("click", (event) => {
  const button = event.target.closest("button"); if (!button) return;
  if (button.dataset.view) { activeView = button.dataset.view; render(); }
  if (button.dataset.evidence) openDetail(button.dataset.evidence);
  if (button.dataset.case) openCase(button.dataset.case);
  if (button.dataset.export !== undefined) downloadReport();
  if (button.dataset.clear !== undefined) { search = ""; render(); }
});
view.addEventListener("input", (event) => { if (event.target.id !== "evidence-search") return; search = event.target.value; const caret = event.target.selectionStart; render(); const input = document.querySelector("#evidence-search"); input.focus(); input.setSelectionRange(caret, caret); });
modalRoot.addEventListener("click", (event) => { if (event.target.hasAttribute("data-close")) closeModal(); const button = event.target.closest("[data-evidence]"); if (button) openDetail(button.dataset.evidence); });
async function loadCourtWorkspace() {
  if (workspaceLoading) return;
  workspaceLoading = true;
  try {
    const me = await fetch("/api/auth/me").then(async (r) => { if (!r.ok) throw Error(); return r.json(); });
    if (me.user.role !== "Court") { window.location.assign("/dashboard"); return; }
    const [e,c,a] = await Promise.all([fetch("/api/evidence").then((r) => r.json()), fetch("/api/cases").then((r) => r.json()), fetch("/api/audit").then((r) => r.json())]);
    evidence = e.evidence.map((x) => ({ ...x, submittedBy: x.submittedBy, submitted: x.submitted, sealed: x.sealed }));
    cases = c.cases.map((x) => ({ ...x, court: x.court_room || "District Court", status: x.state, hearing: x.next_hearing || "Not scheduled", evidence: evidence.filter((evidenceItem) => evidenceItem.caseId === x.id).length }));
    auditEvents = a.events || [];
    render();
  } catch { window.location.assign("/"); }
  finally { workspaceLoading = false; }
}
loadCourtWorkspace();
window.setInterval(() => {
  if (document.visibilityState === "visible" && !modalRoot.childElementCount) loadCourtWorkspace();
}, 15000);
