"use strict";

let evidence = [
  { id: "EV-2026-0042", name: "CCTV_entrance_01.mp4", caseId: "CR-2026-0184", type: "Video", station: "Central Police Station", added: "24 Oct 2026 · 10:42", status: "Awaiting SHO approval", hash: "3b7c4e2a…a91d0f6c", officer: "SI R. Sharma" },
  { id: "EV-2026-0041", name: "device_extraction.zip", caseId: "CR-2026-0181", type: "Archive", station: "North Division", added: "24 Oct 2026 · 09:18", status: "At FSL", hash: "8f0d2b61…6c34bb10", officer: "Inspector A. Khan" },
  { id: "EV-2026-0038", name: "statement_scan.pdf", caseId: "CR-2026-0176", type: "Document", station: "Central Police Station", added: "23 Oct 2026 · 16:06", status: "Verified", hash: "da19a4ce…902fe711", officer: "SI R. Sharma" },
  { id: "EV-2026-0035", name: "mobile_image.E01", caseId: "CR-2026-0168", type: "Forensic image", station: "South Division", added: "23 Oct 2026 · 12:30", status: "Integrity alert", hash: "Mismatch detected", officer: "Inspector P. Das" }
];

let cases = [
  { id: "CR-2026-0184", title: "Unauthorised access investigation", station: "Central Police Station", priority: "High", state: "Evidence review", updated: "24 Oct 2026", evidence: 1 },
  { id: "CR-2026-0181", title: "Digital device examination", station: "North Division", priority: "Standard", state: "At laboratory", updated: "24 Oct 2026", evidence: 1 },
  { id: "CR-2026-0176", title: "Witness statement record", station: "Central Police Station", priority: "Standard", state: "Verified", updated: "23 Oct 2026", evidence: 1 },
  { id: "CR-2026-0168", title: "Mobile device integrity review", station: "South Division", priority: "Urgent", state: "Review required", updated: "23 Oct 2026", evidence: 1 }
];

const views = ["overview", "evidence", "cases", "custody", "reports"];
const viewTitles = { overview: "Overview", evidence: "Evidence", cases: "Cases", custody: "Custody log", reports: "Reports" };
let activeView = "overview";
let searchText = "";
let auditEvents = [];
let toastTimer;
let workspaceLoading = false;

const viewContainer = document.querySelector("#view-container");
const modalRoot = document.querySelector("#modal-root");
const toast = document.querySelector("#toast");

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function statusClass(status) {
  if (status === "Verified" || status === "FSL approved") return "status status-verified";
  if (status === "At FSL" || status === "With FSL") return "status status-fsl";
  return "status status-pending";
}

function policeStatus(item) {
  if (item.fslApproved || item.status === "Verified") return "FSL approved";
  if (item.status === "Integrity alert") return "With FSL";
  return item.status;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3800);
}

function pageHeading(kicker, title, description, action = "") {
  return `<div class="page-heading"><div>${kicker ? `<span class="eyebrow">${kicker}</span>` : ""}${title ? `<h1>${title}</h1>` : ""}${description ? `<p>${description}</p>` : ""}</div>${action}</div>`;
}

function evidenceRows(records) {
  if (!records.length) return `<tr><td colspan="5"><div class="empty-state">No evidence records match your search.</div></td></tr>`;
  return records.map((item) => `<tr><td><div class="evidence-name"><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.id)} · ${escapeHTML(item.type)}</small></div></td><td><span class="case-link">${escapeHTML(item.caseId)}</span></td><td><div class="case-person"><b>${escapeHTML(item.officer)}</b><small>${escapeHTML(item.station)}</small></div></td><td>${escapeHTML(item.added)}</td><td><span class="${statusClass(policeStatus(item))}"><i></i>${escapeHTML(policeStatus(item))}</span></td><td>${item.status === "Awaiting SHO approval" ? `<button class="row-actions" data-send-fsl="${escapeHTML(item.id)}" type="button">Send to FSL</button>` : `<button class="row-actions" data-evidence="${escapeHTML(item.id)}" type="button">View</button>`}</td></tr>`).join("");
}

function evidenceTable(records, compact = false) {
  return `<section class="panel"><div class="panel-heading"><div><h2>${compact ? "Recent Evidence" : "Evidence Register"}</h2><p>${compact ? "Latest registrations and handover updates" : `${records.length} records · Search by evidence, file or case ID`}</p></div>${compact ? `<button class="text-btn" data-navigate="evidence">View register →</button>` : ""}</div>
    ${compact ? "" : `<div class="table-tools"><label class="search-box"><span aria-hidden="true">⌕</span><input id="evidence-search" value="${escapeHTML(searchText)}" placeholder="Search ID, file, case…" aria-label="Search evidence"></label><button class="secondary-btn" data-clear-search type="button">Clear</button></div>`}
    <div class="table-wrap"><table><thead><tr><th>Evidence</th><th>Case ID</th><th>Registered by</th><th>Date added</th><th>Status</th><th></th></tr></thead><tbody>${evidenceRows(records)}</tbody></table></div>
    <div class="table-footer"><span>Showing <b>${records.length}</b> record${records.length === 1 ? "" : "s"}</span></div></section>`;
}

function filteredEvidence() {
  const needle = searchText.toLowerCase();
  return evidence.filter((item) => `${item.id} ${item.name} ${item.caseId} ${item.station} ${item.status}`.toLowerCase().includes(needle));
}

function renderOverview() {
  const awaiting = evidence.filter((item) => item.status === "Awaiting SHO approval").length;
  const fslHandled = evidence.filter((item) => ["At FSL", "Verified", "Integrity alert"].includes(item.status));
  const awaitingFslReceipt = evidence.filter((item) => item.status === "At FSL" && !item.fslReceived).length;
  const fslApproved = evidence.filter((item) => item.fslApproved || item.status === "Verified").length;
  const registeredState = evidence.length ? "Done" : "Next";
  const shoState = awaiting ? "Review" : evidence.some((item) => item.status !== "Awaiting SHO approval") ? "Done" : "Next";
  const fslState = awaitingFslReceipt ? "Pending" : fslHandled.length ? "Done" : "Next";
  const courtState = fslApproved ? "Available" : "Next";
  const mark = (state, number) => state === "Done" || state === "Available" ? "✓" : state === "Review" || state === "Pending" ? "◷" : String(number);
  const stepClass = (state) => state === "Done" || state === "Available" ? "complete" : state === "Review" || state === "Pending" ? "wait" : "";
  return `
    <section class="metric-grid" aria-label="Police workspace summary">
      <article class="metric-card"><div class="metric-top"><span>Cases</span><span class="metric-symbol"><i class="fa-solid fa-book-bookmark"></i></span></div><div class="metric-value crimson-text-semibold">${cases.length} Listed</div><div class="metric-foot">Assigned to your unit</div></article>
      <article class="metric-card"><div class="metric-top"><span>Evidence Registered</span><span class="metric-symbol"><i class="fa-regular fa-folder-open"></i></span></div><div class="metric-value">${evidence.length} Items</div></article>
      <article class="metric-card"><div class="metric-top"><span>Awaiting SHO Approval</span><span class="metric-symbol amber"><i class="fa-regular fa-clock"></i></span></div><div class="metric-value">${awaiting} Items</div><div class="metric-foot">Transfer request needs supervisor review</div></article>
      <article class="metric-card"><div class="metric-top"><span>With FSL</span><span class="metric-symbol green"><i class="fa-regular fa-building"></i></span></div><div class="metric-value">${fslHandled.length} Items</div><div class="metric-foot">Handed over for lab examination</div></article>
      <article class="metric-card"><div class="metric-top"><span>FSL approved</span><span class="metric-symbol green"><i class="fa-solid fa-check"></i></span></div><div class="metric-value">${fslApproved} Items</div><div class="metric-foot">Ready for the case record</div></article>
    </section>
    <div class="panel-grid">${evidenceTable([...evidence].slice(0, 4), true)}
      <section class="panel"><div class="panel-heading"><div><h2>Custody Workflow</h2><p>Live progress from registered evidence and case handovers</p></div><span class="status status-fsl"><i></i>LIVE</span></div><div class="panel-body workflow-list">
        <div class="workflow-step"><span class="step-mark ${stepClass(registeredState)}">${mark(registeredState, 1)}</span><div><b>Evidence registered</b><small>${evidence.length} item${evidence.length === 1 ? "" : "s"} recorded by your unit</small></div><span class="step-state">${registeredState}</span></div>
        <div class="workflow-step"><span class="step-mark ${stepClass(shoState)}">${mark(shoState, 2)}</span><div><b>SHO approval</b><small>${awaiting ? `${awaiting} transfer${awaiting === 1 ? "" : "s"} waiting for review` : "No transfer approvals waiting"}</small></div><span class="step-state">${shoState}</span></div>
        <div class="workflow-step"><span class="step-mark ${stepClass(fslState)}">${mark(fslState, 3)}</span><div><b>FSL receipt</b><small>${awaitingFslReceipt ? `${awaitingFslReceipt} transfer${awaitingFslReceipt === 1 ? "" : "s"} waiting for lab receipt` : `${fslHandled.length} item${fslHandled.length === 1 ? "" : "s"} handed to FSL`}</small></div><span class="step-state">${fslState}</span></div>
        <div class="workflow-step"><span class="step-mark ${stepClass(courtState)}">${mark(courtState, 4)}</span><div><b>Court record</b><small>${fslApproved ? `${fslApproved} FSL-approved item${fslApproved === 1 ? "" : "s"} ready for the case record` : "Waiting for FSL approval"}</small></div><span class="step-state">${courtState}</span></div>
      </div></section>
    </div>`;
}

function renderEvidence() {
  const action = `<button class="primary-btn" data-open-register type="button">＋ Register evidence</button>`;
  return `${pageHeading("POLICE MODULE · EVIDENCE REGISTER", "Registered evidence", "Register digital evidence, link it to a case and track the approval handover.", action)}${evidenceTable(filteredEvidence())}`;
}

function renderCases() {
  return `${pageHeading("POLICE MODULE · CASE MANAGEMENT", "Cases linked to your station", "Review case status, priority and the evidence currently attached to each case.")}
    <div class="case-grid">${cases.map((item) => {
    const count = evidence.filter((record) => record.caseId === item.id).length;
    return `<article class="case-card"><div class="case-card-head"><span class="case-id">${escapeHTML(item.id)}</span><span class="case-priority">${escapeHTML(item.priority)}</span></div><h2>${escapeHTML(item.title)}</h2><p>${escapeHTML(item.station)}</p><div class="case-stats"><span>CASE STATUS<b>${escapeHTML(item.state)}</b></span><span>EVIDENCE<b>${count} linked item${count === 1 ? "" : "s"}</b></span><span>UPDATED<b>${escapeHTML(item.updated)}</b></span></div><button class="text-btn" type="button" data-case="${escapeHTML(item.id)}">View linked evidence →</button></article>`;
  }).join("")}</div>`;
}

function renderCustody() {
  return `${pageHeading("POLICE MODULE · AUDIT TRAIL", "Custody and handover history", "Live chronological record of evidence registrations, approvals and receiving checks.")}
    <section class="panel"><div class="panel-heading"><div><h2>Recent custody events</h2><p>Persisted activity from the shared chain-of-custody ledger</p></div><span class="status status-verified"><i></i>LIVE AUDIT</span></div>
      <div class="timeline-list">${auditEvents.length ? auditEvents.map((event) => {
        const item = evidence.find((row) => row.id === event.evidenceId);
        const evidenceLabel = item ? `${item.id} · ${item.name}` : (event.item || "Case activity");
        return `<article class="timeline-item"><span class="timeline-dot ${event.kind || ""}"></span><div class="timeline-copy"><b>${escapeHTML(event.action)}${event.evidenceId ? ` · ${escapeHTML(event.evidenceId)}` : ""}</b><small>${escapeHTML(evidenceLabel)} · ${escapeHTML(event.actor || "Portal system")}${event.caseId ? ` · Case ${escapeHTML(event.caseId)}` : ""}</small></div><span class="timeline-time">${escapeHTML(event.time)}</span></article>`;
      }).join("") : `<div class="empty-state">No custody activity has been recorded yet.</div>`}</div></section>`;
}

function renderReports() {
  const verified = evidence.filter((item) => item.status === "Verified").length;
  const pending = evidence.filter((item) => item.status === "Awaiting SHO approval" || (item.status === "At FSL" && !item.fslReceived)).length;
  return `${pageHeading("POLICE MODULE · REPORTING", "Station evidence report", "A summary of sample evidence status and pending handovers.", `<button class="secondary-btn" data-export-report type="button"><i class="fa-solid fa-file-arrow-down"></i> Download CSV</button>`)}
    <section class="report-grid"><article class="report-card"><small>FSL APPROVED EVIDENCE</small><strong>${verified}</strong><p>Items approved by the laboratory for the case record</p></article><article class="report-card"><small>PENDING HANDOVERS</small><strong>${pending}</strong><p>Records awaiting supervisor or laboratory receipt</p></article><article class="report-card"><small>REGISTERED EVIDENCE</small><strong>${evidence.length}</strong><p>Evidence registered by your station</p></article></section>`;
}

function render() {
  document.querySelector("#dashboard-current").textContent = viewTitles[activeView];
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView));
  const renderers = { overview: renderOverview, evidence: renderEvidence, cases: renderCases, custody: renderCustody, reports: renderReports };
  viewContainer.innerHTML = renderers[activeView]();
}

function openRegisterModal() {
  const caseOptions = cases.map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.id)} — ${escapeHTML(item.title)}</option>`).join("");
  const existingCases = cases.length > 0;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="register-title"><div class="modal-head"><div><h2 id="register-title">Register evidence</h2></div><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><form class="modal-form" id="register-form"><fieldset class="case-mode-group"><legend>Case type</legend><label class="case-mode-option"><input type="radio" name="caseMode" value="existing" ${existingCases ? "checked" : "disabled"}><span><b>Existing case</b><small>Attach this evidence to an assigned case</small></span></label><label class="case-mode-option"><input type="radio" name="caseMode" value="new" ${existingCases ? "" : "checked"}><span><b>New case</b><small>Create a case and attach this evidence</small></span></label></fieldset><label class="form-field" id="existing-case-field">Choose case<select id="case-choice" name="caseId" required ${existingCases ? "" : "disabled"}><option value="" selected disabled>${existingCases ? "Select an assigned case" : "No cases are assigned to your unit"}</option>${caseOptions}</select></label><input type="hidden" id="new-case-id" name="caseId" value="__NEW_CASE__" disabled><div class="new-case-fields" id="new-case-fields"><label class="form-field">New case title<input name="newCaseTitle" id="new-case-title" type="text" minlength="3" maxlength="150" placeholder="e.g. Digital device examination" ${existingCases ? "disabled" : "required"}></label><label class="form-field">Priority<select name="newCasePriority" id="new-case-priority" ${existingCases ? "disabled" : ""}><option>Standard</option><option>High</option><option>Urgent</option></select></label><span class="form-help">The case number will be assigned automatically and linked to your police unit.</span></div><label class="form-field">Evidence file<input name="evidenceFile" type="file" required></label><div class="upload-error" id="upload-error" role="alert" hidden></div><div class="modal-actions"><button class="secondary-btn" type="button" data-close-modal>Cancel</button><button class="primary-btn" type="submit">Calculate hash &amp; register</button></div></form></section></div>`;
  const existingRadio = modalRoot.querySelector('input[name="caseMode"][value="existing"]');
  const newRadio = modalRoot.querySelector('input[name="caseMode"][value="new"]');
  const caseChoice = modalRoot.querySelector("#case-choice");
  const newCaseId = modalRoot.querySelector("#new-case-id");
  const existingCaseField = modalRoot.querySelector("#existing-case-field");
  const newCaseFields = modalRoot.querySelector("#new-case-fields");
  const newCaseTitle = modalRoot.querySelector("#new-case-title");
  const newCasePriority = modalRoot.querySelector("#new-case-priority");
  const setCaseMode = (createNew) => {
    caseChoice.disabled = createNew || !existingCases;
    existingCaseField.hidden = createNew;
    newCaseId.disabled = !createNew;
    newCaseFields.hidden = !createNew;
    newCaseTitle.disabled = !createNew;
    newCaseTitle.required = createNew;
    newCasePriority.disabled = !createNew;
    modalRoot.querySelector("#upload-error").hidden = true;
  };
  existingRadio.addEventListener("change", () => { if (existingRadio.checked) setCaseMode(false); });
  newRadio.addEventListener("change", () => { if (newRadio.checked) setCaseMode(true); });
  setCaseMode(!existingCases);
}

function closeModal() { modalRoot.innerHTML = ""; }

function openEvidenceDetail(id) {
  const item = evidence.find((record) => record.id === id);
  if (!item) return;
  const displayStatus = policeStatus(item);
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="modal-head"><div><h2 id="detail-title">${escapeHTML(item.id)}</h2><p>${escapeHTML(item.name)} · ${escapeHTML(item.caseId)}</p></div><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-form"><span class="status ${statusClass(displayStatus).split(" ")[1]}"><i></i>${escapeHTML(displayStatus)}</span>${item.fslReport ? `<label class="form-field">FSL examination report<textarea readonly>${escapeHTML(item.fslReport)}</textarea></label>` : ""}<label class="form-field">Original SHA-256<input value="${escapeHTML(item.hash)}" readonly></label><p class="form-help">Registered by ${escapeHTML(item.officer)} at ${escapeHTML(item.station)} · ${escapeHTML(item.added)}</p></div></section></div>`;
}

function openCaseEvidence(caseId) {
  const caseItem = cases.find((row) => row.id === caseId);
  const linked = evidence.filter((row) => row.caseId === caseId);
  if (!caseItem || !linked.length) { showToast("No evidence is linked to this case yet."); return; }
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="linked-evidence-title"><div class="modal-head"><div><h2 id="linked-evidence-title">${escapeHTML(caseItem.title)}</h2><p>${escapeHTML(caseItem.id)}</p></div><button class="modal-close" type="button" data-close-modal aria-label="Close">×</button></div><div class="modal-form">${linked.map((record, index) => `<div class="linked-hash-record"><label class="form-field">Evidence item ${index + 1} · SHA-256<input value="${escapeHTML(record.hash)}" readonly></label></div>`).join("")}<p class="form-help">${linked.length} separate evidence hash${linked.length === 1 ? "" : "es"} registered to this case.</p></div></section></div>`;
}

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => {
    if (!views.includes(button.dataset.view)) return;
    activeView = button.dataset.view;
    render();
  });
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
});

viewContainer.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.hasAttribute("data-open-register")) openRegisterModal();
  if (target.hasAttribute("data-navigate")) { activeView = target.dataset.navigate; render(); }
  if (target.hasAttribute("data-evidence")) openEvidenceDetail(target.dataset.evidence);
  if (target.hasAttribute("data-send-fsl")) sendToFsl(target.dataset.sendFsl);
  if (target.hasAttribute("data-clear-search")) { searchText = ""; render(); }
  if (target.hasAttribute("data-export-report")) exportReport();
  if (target.hasAttribute("data-case")) {
    openCaseEvidence(target.dataset.case);
  }
});

viewContainer.addEventListener("input", (event) => {
  if (event.target.id !== "evidence-search") return;
  searchText = event.target.value;
  const cursor = event.target.selectionStart;
  render();
  const input = document.querySelector("#evidence-search");
  input.focus();
  input.setSelectionRange(cursor, cursor);
});

modalRoot.addEventListener("click", (event) => {
  if (event.target.hasAttribute("data-close-modal")) closeModal();
});

modalRoot.addEventListener("submit", async (event) => {
  if (event.target.id !== "register-form") return;
  event.preventDefault();
  const submit = event.target.querySelector('[type="submit"]');
  const data = new FormData(event.target);
  const file = data.get("evidenceFile");
  const caseId = String(data.get("caseId") || "").trim().toUpperCase();
  const creatingCase = caseId === "__NEW_CASE__";
  const newCaseTitle = String(data.get("newCaseTitle") || "").trim();
  const errorBox = document.querySelector("#upload-error");
  const showUploadError = (message) => { errorBox.textContent = message; errorBox.hidden = false; };
  errorBox.hidden = true;
  if (!creatingCase && !cases.some((item) => item.id === caseId)) { showUploadError("Choose an existing case assigned to your unit, or select Create a new case."); return; }
  if (creatingCase && (newCaseTitle.length < 3 || newCaseTitle.length > 150)) { showUploadError("Enter a new case title between 3 and 150 characters."); return; }
  if (!(file instanceof File) || !file.size) { showUploadError("Choose a non-empty evidence file first."); return; }
  if (file.size > 25 * 1024 * 1024) { showUploadError("This file is larger than the 25 MB demo limit. Choose a smaller file."); return; }
  if (!window.crypto?.subtle) { showUploadError("File hashing needs a secure browser context such as localhost or HTTPS."); return; }
  submit.disabled = true;
  submit.textContent = creatingCase ? "Creating case & calculating SHA-256…" : "Calculating SHA-256…";
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    data.set("clientHash", hash);
    const response = await fetch("/api/evidence", { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not register evidence.");
    evidence.unshift(result.evidence);
    if (result.case) cases = [result.case, ...cases.filter((item) => item.id !== result.case.id)];
    closeModal();
    render();
    showToast(`${creatingCase ? `New case ${result.case?.id || result.evidence.caseId} created. ` : ""}Evidence saved securely. SHA-256: ${hash.slice(0, 14)}…`);
  } catch (error) {
    showUploadError(error.message || "Could not register this file. Please try again.");
    submit.disabled = false;
    submit.textContent = "Calculate hash & register";
  }
});

function exportReport() {
  const rows = [["Evidence ID", "File", "Case ID", "Type", "Station", "Status", "SHA-256"], ...evidence.map((item) => [item.id, item.name, item.caseId, item.type, item.station, policeStatus(item), item.hash])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "forensichain-police-evidence-report.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Evidence report downloaded as CSV.");
}

async function apiRequest(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not load portal data.");
  return payload;
}

async function loadPoliceWorkspace() {
  if (workspaceLoading) return;
  workspaceLoading = true;
  try {
    const { user } = await apiRequest("/api/auth/me");
    if (user.role !== "Police") { window.location.assign("/dashboard"); return; }
    const [evidenceData, caseData, auditData] = await Promise.all([apiRequest("/api/evidence"), apiRequest("/api/cases"), apiRequest("/api/audit")]);
    evidence = evidenceData.evidence;
    cases = caseData.cases.map((x) => ({ ...x, updated: x.updated || x.updated_at || "—" }));
    auditEvents = auditData.events || [];
    render();
  } catch { window.location.assign("/"); }
  finally { workspaceLoading = false; }
}

async function sendToFsl(id) {
  try {
    const response = await fetch(`/api/evidence/${encodeURIComponent(id)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send-to-fsl" }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not send evidence to FSL.");
    await loadPoliceWorkspace(); showToast("Handover recorded. Evidence is now available to FSL.");
  } catch (error) { showToast(error.message); }
}

loadPoliceWorkspace();
window.setInterval(() => { if (document.visibilityState === "visible") loadPoliceWorkspace(); }, 15000);
