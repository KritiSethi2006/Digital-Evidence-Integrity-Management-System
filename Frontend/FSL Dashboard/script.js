"use strict";

let evidence = [
  { id: "EV-2026-0042", name: "CCTV_entrance_01.mp4", caseId: "CR-2026-0184", type: "Video", receivedFrom: "Central Police Station · SI R. Sharma", received: "24 Oct 2026 · 10:42", status: "Awaiting FSL receipt", hash: "3b7c4e2a…a91d0f6c", examiner: "Unassigned" },
  { id: "EV-2026-0041", name: "device_extraction.zip", caseId: "CR-2026-0181", type: "Archive", receivedFrom: "North Division · Inspector A. Khan", received: "24 Oct 2026 · 09:18", status: "In examination", hash: "8f0d2b61…6c34bb10", examiner: "Dr. Meera Nair" },
  { id: "EV-2026-0038", name: "statement_scan.pdf", caseId: "CR-2026-0176", type: "Document", receivedFrom: "Central Police Station · SI R. Sharma", received: "23 Oct 2026 · 16:06", status: "Verified", hash: "da19a4ce…902fe711", examiner: "Dr. Meera Nair" },
  { id: "EV-2026-0035", name: "mobile_image.E01", caseId: "CR-2026-0168", type: "Forensic image", receivedFrom: "South Division · Inspector P. Das", received: "23 Oct 2026 · 12:30", status: "Integrity alert", hash: "Mismatch detected", examiner: "Dr. Meera Nair" }
];
const events = [];
let auditEvents = [];
let cases = [];
const currentView = document.querySelector("#view-container");
const modalRoot = document.querySelector("#modal-root");
const toast = document.querySelector("#toast");
const title = document.querySelector("#dashboard-current");
let activeView = "overview";
let search = "";
let toastTimer;
let workspaceLoading = false;

function esc(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function notify(message) { toast.textContent = message; toast.classList.add("visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500); }
function statusClass(status) { return status === "Verified" || status === "FSL approved" ? "status status-verified" : status === "In examination" ? "status status-fsl" : status === "Integrity alert" ? "status status-alert" : "status status-pending"; }
function header(kicker, heading, copy, action = "") { return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${heading}</h1><p>${copy}</p></div>${action}</div>`; }

function evidenceTable(rows, compact = false) {
  const body = rows.length ? rows.map((item) => `<tr><td><div class="evidence-name"><b>${esc(item.name)}</b><small>${esc(item.id)} · ${esc(item.type)}</small></div></td><td><span class="case-id">${esc(item.caseId)}</span></td><td>${esc(item.receivedFrom)}</td><td>${esc(item.received)}</td><td><span class="${statusClass(item.status)}"><i></i>${esc(item.status === "Verified" ? "FSL approved" : item.status)}</span></td><td>${activeView === "intake" && item.status === "Awaiting FSL receipt" ? `<button class="row-actions" type="button" data-action="receive" data-id="${esc(item.id)}">Intake</button>` : `<button class="row-actions" type="button" data-detail="${esc(item.id)}">Details</button>`}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-state">No evidence matches your search.</div></td></tr>`;
  return `<section class="panel"><div class="panel-heading"><div><h2>${compact ? "Latest evidence activity" : "Evidence intake queue"}</h2><p>${compact ? "Intake and verification updates" : `${rows.length} sample records · Verify every seal and hash at receipt`}</p></div>${compact ? `<button class="text-btn" data-view="intake" type="button">Open intake queue →</button>` : ""}</div>${compact ? "" : `<div class="table-tools"><label class="search-box">⌕<input id="evidence-search" value="${esc(search)}" placeholder="Search evidence or case…" aria-label="Search evidence"></label><button type="button" class="secondary-btn" data-clear-search>Clear</button></div>`}<div class="table-wrap"><table><thead><tr><th>Evidence</th><th>Case ID</th><th>Transferred by</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>${body}</tbody></table></div><div class="table-footer"><span>${rows.length} record${rows.length === 1 ? "" : "s"}</span><span>Training sample data</span></div></section>`;
}

function renderOverview() {
  const intake = evidence.filter((x) => x.status === "Awaiting FSL receipt").length;
  const exam = evidence.filter((x) => x.status === "In examination").length;
  const verified = evidence.filter((x) => x.status === "Verified").length;
  const pendingFinal = evidence.filter((x) => x.fslExamCompleted && x.status !== "Verified" && x.status !== "Integrity alert").length;
  const alerts = evidence.filter((x) => x.status === "Integrity alert").length;
  return `<section class="metric-grid"><article class="metric-card"><div class="metric-top"><span>Awaiting intake</span><span class="metric-symbol amber"><i class="fa-solid fa-inbox"></i></span></div><div class="metric-value crimson-text-semibold">${intake} Items</div><div class="metric-foot">Confirm seal and transfer details</div></article><article class="metric-card"><div class="metric-top"><span>In examination</span><span class="metric-symbol"><i class="fa-solid fa-microscope"></i></span></div><div class="metric-value crimson-text-semibold">${exam} Items</div><div class="metric-foot">Assigned to your laboratory unit</div></article><article class="metric-card"><div class="metric-top"><span>FSL approved</span><span class="metric-symbol green"><i class="fa-solid fa-check"></i></span></div><div class="metric-value crimson-text-semibold">${verified} Items</div><div class="metric-foot">Final hash matches Police registration</div></article><article class="metric-card"><div class="metric-top"><span>Integrity alerts</span><span class="metric-symbol red"><i class="fa-solid fa-triangle-exclamation"></i></span></div><div class="metric-value crimson-text-semibold">${alerts} Open</div><div class="metric-foot"><span class="alert">Supervisor review required</span></div></article><article class="metric-card"><div class="metric-top"><span>Assigned cases</span><span class="metric-symbol"><i class="fa-solid fa-book-bookmark"></i></span></div><div class="metric-value crimson-text-semibold">${new Set(evidence.map((item) => item.caseId)).size} Cases</div><div class="metric-foot">Linked to laboratory evidence</div></article></section>
    <div class="panel-grid">${evidenceTable(evidence.slice(0, 4), true)}<section class="panel"><div class="panel-heading"><div><h2>Laboratory workflow</h2><p>Live status from the shared evidence register</p></div><span class="status status-fsl"><i></i>LIVE</span></div><div class="panel-body workflow-list"><div class="workflow-step"><span class="step-mark wait">1</span><div><b>Awaiting intake</b><small>Police-transferred evidence needs receipt</small></div><span class="step-state">${intake} pending</span></div><div class="workflow-step"><span class="step-mark complete">2</span><div><b>Intake hash matched</b><small>Accepted evidence proceeds to examination</small></div><span class="step-state">${evidence.filter((x) => x.fslReceived && x.status !== "Integrity alert").length} received</span></div><div class="workflow-step"><span class="step-mark">3</span><div><b>Examination</b><small>Examiner records the findings</small></div><span class="step-state">${exam} active</span></div><div class="workflow-step"><span class="step-mark ${pendingFinal ? "wait" : "complete"}">4</span><div><b>Final hash &amp; approval</b><small>Re-upload after examination to verify</small></div><span class="step-state">${pendingFinal} pending · ${verified} approved</span></div></div></section></div>`;
}

function renderIntake() {
  const rows = evidence.filter((item) => `${item.id} ${item.name} ${item.caseId} ${item.receivedFrom}`.toLowerCase().includes(search.toLowerCase()));
  return `${header("FSL MODULE · EVIDENCE RECEIPT", "Intake queue", "Upload received evidence to compare its SHA-256 with the Police registration.")}${evidenceTable(rows)}`;
}

function renderExamination() {
  const visibleCases = cases.filter((item) => `${item.id} ${item.title} ${item.station} ${item.state}`.toLowerCase().includes(search.toLowerCase()));
  const cards = visibleCases.map((caseItem) => {
    const linkedEvidence = evidence.filter((item) => item.caseId === caseItem.id);
    const approved = linkedEvidence.length > 0 && linkedEvidence.every((item) => item.status === "Verified");
    return `<article class="case-card"><div class="case-card-head"><span class="case-id">${esc(caseItem.id)}</span><span class="${approved ? "status status-verified" : "status status-pending"}"><i></i>${approved ? "FSL approved" : esc(caseItem.state)}</span></div><h2>${esc(caseItem.title)}</h2><p>${esc(caseItem.station)} · ${linkedEvidence.length} linked evidence item${linkedEvidence.length === 1 ? "" : "s"}</p><div class="case-stats"><span>EVIDENCE<b>${linkedEvidence.length} item${linkedEvidence.length === 1 ? "" : "s"}</b></span><span>EXAMINATION<b>${linkedEvidence.some((item) => item.status === "In examination") ? "In progress" : linkedEvidence.some((item) => item.fslExamCompleted && item.status !== "Verified") ? "Final hash pending" : approved ? "FSL approved" : "Intake pending"}</b></span></div><button class="secondary-btn" type="button" data-case-details="${esc(caseItem.id)}">Details</button></article>`;
  }).join("");
  const searchBox = `<div class="table-tools"><label class="search-box">⌕<input id="evidence-search" value="${esc(search)}" placeholder="Search case ID, title, evidence…" aria-label="Search examination cases"></label><button type="button" class="secondary-btn" data-clear-search>Clear</button></div>`;
  return `${header("FSL MODULE · CASE EXAMINATIONS", "Examination workspace", "Cases from Police with their linked laboratory evidence and examination decisions.")}${searchBox}<div class="case-grid">${cards || `<section class="panel"><div class="empty-state">No Police cases match your search.</div></section>`}</div>`;
}

function renderCustody() {
  const timeline = auditEvents.length ? auditEvents : [...events].reverse();
  return `${header("FSL MODULE · CHAIN OF CUSTODY", "Custody log", "Live, shared record of laboratory intake, examination and approval activity.")}<section class="panel"><div class="panel-heading"><div><h2>Live custody activity</h2><p>Persisted events from the shared chain-of-custody ledger</p></div><span class="status status-fsl"><i></i>LIVE</span></div><div class="timeline-list">${timeline.length ? timeline.map((event) => {
    const item = evidence.find((row) => row.id === event.evidenceId);
    const evidenceLabel = item ? `${item.id} · ${item.name}` : (event.item || "Case activity");
    const detail = event.actor ? `${event.actor}${event.caseId ? ` · Case ${event.caseId}` : ""}` : event.detail;
    return `<article class="timeline-item"><span class="timeline-dot ${event.kind || ""}"></span><div class="timeline-copy"><b>${esc(event.action || event.title)}${event.evidenceId ? ` · ${esc(event.evidenceId)}` : ""}</b><small>${esc(evidenceLabel)} · ${esc(detail || "Recorded activity")}</small></div><span class="timeline-time">${esc(event.time || event.record?.received || "")}</span></article>`;
  }).join("") : `<div class="empty-state">No custody activity has been recorded yet.</div>`}</div></section>`;
}

function renderReports() {
  const verified = evidence.filter((x) => x.status === "Verified").length;
  const alertCount = evidence.filter((x) => x.status === "Integrity alert").length;
  return `${header("FSL MODULE · LABORATORY REPORTING", "Verification reports", "Review examination outcomes and export the current register.", `<button class="secondary-btn" data-export type="button"><i class="fa-solid fa-file-arrow-down"></i> Export CSV</button>`)}<section class="report-grid"><article class="report-card"><small>FSL APPROVED</small><strong>${verified}</strong><p>Evidence with final hash verification</p></article><article class="report-card"><small>EXAMINATION ACTIVE</small><strong>${evidence.filter((x) => x.status === "In examination").length}</strong><p>Assigned to the FSL unit</p></article><article class="report-card"><small>EXCEPTIONS</small><strong>${alertCount}</strong><p>Integrity issues requiring investigation</p></article></section>`;
}

function render() {
  const labels = { overview: "Overview", intake: "Intake queue", examination: "Examination", custody: "Custody logs", reports: "Reports" };
  title.textContent = labels[activeView];
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === activeView));
  currentView.innerHTML = ({ overview: renderOverview, intake: renderIntake, examination: renderExamination, custody: renderCustody, reports: renderReports })[activeView]();
}

function closeModal() { modalRoot.innerHTML = ""; }
function bindFslUploadForm(formId) {
  const form = modalRoot.querySelector(`#${formId}`);
  if (!form) return;
  const submitButton = form.querySelector('button[type="submit"]');
  const feedback = form.querySelector("#upload-feedback");
  const isFinal = formId === "final-verification-form";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    uploadFslEvidence(form, submitButton, feedback, isFinal);
  });
  submitButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    uploadFslEvidence(form, submitButton, feedback, isFinal);
  });
}

async function uploadFslEvidence(form, submitButton, feedback, isFinal) {
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  submitButton.textContent = "Uploading & checking hash…";
  feedback.className = "upload-feedback is-pending";
  feedback.textContent = "Upload started. Comparing SHA-256 with the Police registration…";
  try {
    const id = new FormData(form).get("id");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    let response;
    try {
      response = await fetch(`/api/evidence/${encodeURIComponent(id)}/${isFinal ? "final-verification" : "receive"}`, {
        method: "POST", body: new FormData(form), signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeout);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Upload failed (HTTP ${response.status}).`);
    if (result.hashMatches) {
      closeModal();
      await loadFslWorkspace();
      if (isFinal) notify("Final hash matches the Police registration. FSL approved.");
      else { activeView = "examination"; render(); notify("Hash matches. Intake accepted; evidence is now in examination."); }
      return;
    }
    closeModal();
    await loadFslWorkspace();
    notify("Hash mismatch recorded. Approval is unavailable; integrity alert raised.");
  } catch (error) {
    feedback.className = "upload-feedback is-error";
    feedback.setAttribute("role", "alert");
    feedback.textContent = error.name === "AbortError"
      ? "Upload timed out. Check that the portal is still running, then try again."
      : (error.message || "Upload failed. Please check the server and try again.");
    submitButton.disabled = false;
    submitButton.textContent = isFinal ? "Verify final hash" : "Verify hash & accept intake";
  }
}

function openDetail(id) {
  const item = evidence.find((row) => row.id === id);
  if (!item) return;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div class="modal-head"><div><h2 id="detail-title">${esc(item.id)}</h2><p>${esc(item.name)} · ${esc(item.caseId)}</p></div><button class="modal-close" data-close-modal type="button" aria-label="Close">×</button></div><div class="modal-form"><span class="${statusClass(item.status)}"><i></i>${esc(item.status === "Verified" ? "FSL approved" : item.status)}</span><label class="form-field">Police registered SHA-256<input value="${esc(item.hash)}" readonly></label>${item.fslReceivedHash ? `<label class="form-field">Intake SHA-256<input value="${esc(item.fslReceivedHash)}" readonly></label>` : ""}${item.fslFinalHash ? `<label class="form-field">Final SHA-256<input value="${esc(item.fslFinalHash)}" readonly></label>` : ""}<p class="form-help">Transferred by ${esc(item.receivedFrom)} · Laboratory examiner: ${esc(item.examiner)} · ${esc(item.received)}</p></div></section></div>`;
}

function openCaseDetails(caseId) {
  const caseItem = cases.find((row) => row.id === caseId);
  if (!caseItem) return;
  const linkedEvidence = evidence.filter((item) => item.caseId === caseId);
  const content = linkedEvidence.length ? linkedEvidence.map((item) => {
    let action = `<button class="row-actions" type="button" data-detail="${esc(item.id)}">View hash details</button>`;
    let state = item.status === "Verified" ? "FSL approved" : item.status;
    if (item.status === "Awaiting FSL receipt") action = `<button class="primary-btn" type="button" data-view="intake">Go to Intake queue</button>`;
    if (item.status === "In examination") action = `<button class="primary-btn" type="button" data-action="verify" data-id="${esc(item.id)}">Complete examination</button>`;
    else if (item.fslExamCompleted && item.status !== "Verified" && item.status !== "Integrity alert") action = `<button class="primary-btn" type="button" data-action="final-verify" data-id="${esc(item.id)}">Upload again &amp; verify hash</button>`;
    else if (item.status === "Integrity alert") action = `<button class="secondary-btn" type="button" data-detail="${esc(item.id)}">Review hash details</button>`;
    return `<article class="workflow-step fsl-evidence-detail"><div><b>${esc(item.name)}</b><small>${esc(item.id)} · ${esc(item.type)} · ${esc(state)}</small></div>${action}</article>`;
  }).join("") : `<p class="form-help">No evidence has been transferred from Police for this case yet.</p>`;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="case-detail-title"><div class="modal-head"><div><h2 id="case-detail-title">${esc(caseItem.title)}</h2><p>${esc(caseItem.id)} · ${esc(caseItem.station)}</p></div><button class="modal-close" data-close-modal type="button" aria-label="Close">×</button></div><div class="modal-form"><h3>Linked evidence &amp; examination</h3>${content}</div></section></div>`;
}

async function recordAction(id, action) {
  const item = evidence.find((row) => row.id === id);
  if (!item) return;
  if (action === "receive" && item.status === "Awaiting FSL receipt") {
    if (!item.originalAvailable) { notify("This training record has no stored original file. Upload evidence from Police first."); return; }
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>Intake evidence</h2><p>${esc(item.id)} · Upload the received evidence to compare it with Police SHA-256.</p></div><button class="modal-close" data-close-modal type="button">×</button></div><form class="modal-form" id="receive-form"><input type="hidden" name="id" value="${esc(item.id)}"><label class="form-field">Upload the received evidence<input name="receivedFile" type="file" required></label><p class="form-help">A matching hash accepts the evidence into FSL examination. A mismatch is recorded as an integrity alert.</p><p class="upload-feedback" id="upload-feedback" role="status" aria-live="polite"></p><div class="modal-actions"><button class="secondary-btn" data-close-modal type="button">Cancel</button><button class="primary-btn" type="submit">Verify hash &amp; accept intake</button></div></form></section></div>`;
    bindFslUploadForm("receive-form");
  } else if (action === "final-verify" && item.fslExamCompleted) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>Final examination verification</h2><p>${esc(item.id)} · ${esc(item.name)}</p></div><button class="modal-close" data-close-modal type="button">×</button></div><form class="modal-form" id="final-verification-form"><input type="hidden" name="id" value="${esc(item.id)}"><label class="form-field">Upload the examined evidence again<input name="receivedFile" type="file" required></label><p class="form-help">FSL approval is recorded only if this SHA-256 matches the original Police-registered hash.</p><p class="upload-feedback" id="upload-feedback" role="status" aria-live="polite"></p><div class="modal-actions"><button class="secondary-btn" data-close-modal type="button">Cancel</button><button class="primary-btn" type="submit">Verify final hash</button></div></form></section></div>`;
    bindFslUploadForm("final-verification-form");
  } else if (action === "verify" && item.status === "In examination") {
    const report = window.prompt("Enter a short examination summary to attach to the custody record (at least 8 characters):");
    if (!report) return;
    const response = await fetch(`/api/evidence/${encodeURIComponent(id)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete-examination", report }) });
    const result = await response.json(); if (!response.ok) { notify(result.error || "Could not complete examination."); return; }
    closeModal(); await loadFslWorkspace(); openCaseDetails(item.caseId); notify("Examination completed. Upload the evidence again in Details for final hash verification."); return;
  } else if (action === "approve-receipt" && item.status === "Awaiting FSL approval") {
    await approveFslEvidence(id); return;
  } else return;
  render();
}

async function approveFslEvidence(id) {
  const response = await fetch(`/api/evidence/${encodeURIComponent(id)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve-receipt" }) });
  const result = await response.json();
  if (!response.ok) { notify(result.error || "Could not approve the FSL receipt."); return; }
  closeModal(); await loadFslWorkspace(); notify("FSL approved. Status updated in the shared case register.");
}

function exportReport() {
  const lines = [["Evidence ID", "File", "Case ID", "Type", "Transfer source", "Status", "Hash", "Examiner"], ...evidence.map((x) => [x.id, x.name, x.caseId, x.type, x.receivedFrom, x.status, x.hash, x.examiner])];
  const csv = lines.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "forensichain-fsl-verification-report.csv"; anchor.click(); URL.revokeObjectURL(url);
  notify("Sample FSL register exported as CSV.");
}

document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => { activeView = button.dataset.view; render(); }));
document.querySelector("#sign-out").addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); });
currentView.addEventListener("click", (event) => {
  const button = event.target.closest("button"); if (!button) return;
  if (button.dataset.view) { activeView = button.dataset.view; render(); }
  if (button.dataset.detail) openDetail(button.dataset.detail);
  if (button.dataset.caseDetails) openCaseDetails(button.dataset.caseDetails);
  if (button.dataset.action) recordAction(button.dataset.id, button.dataset.action);
  if (button.hasAttribute("data-export")) exportReport();
  if (button.hasAttribute("data-clear-search")) { search = ""; render(); }
});
currentView.addEventListener("input", (event) => {
  if (event.target.id !== "evidence-search") return;
  search = event.target.value; const caret = event.target.selectionStart; render();
  const input = document.querySelector("#evidence-search"); input.focus(); input.setSelectionRange(caret, caret);
});
modalRoot.addEventListener("click", (event) => {
  if (event.target.hasAttribute("data-close-modal")) closeModal();
  const button = event.target.closest("button");
  if (button?.dataset.view) { activeView = button.dataset.view; closeModal(); render(); }
  if (button?.dataset.detail) openDetail(button.dataset.detail);
  if (button?.dataset.action) recordAction(button.dataset.id, button.dataset.action);
});
async function loadFslWorkspace() {
  if (workspaceLoading) return;
  workspaceLoading = true;
  try {
    const me = await fetch("/api/auth/me").then(async (r) => { if (!r.ok) throw Error(); return r.json(); });
    if (me.user.role !== "FSL") { window.location.assign("/dashboard"); return; }
    const [payload, casePayload, auditPayload] = await Promise.all([fetch("/api/evidence").then(async (r) => { if (!r.ok) throw Error(); return r.json(); }), fetch("/api/cases").then(async (r) => { if (!r.ok) throw Error(); return r.json(); }), fetch("/api/audit").then(async (r) => { if (!r.ok) throw Error(); return r.json(); })]);
    evidence = payload.evidence.map((x) => ({ ...x, status: x.status === "At FSL" ? (!x.fslReceived ? "Awaiting FSL receipt" : x.fslExamCompleted ? "Examination complete · awaiting final verification" : "In examination") : x.status, receivedFrom: x.receivedFrom, received: x.received, examiner: x.examiner, hash: x.hash, fslReceivedHash: x.fslReceivedHash || "", fslFinalHash: x.fslFinalHash || "" }));
    cases = casePayload.cases.map((x) => ({ ...x, state: x.state, evidenceCount: x.evidenceCount ?? x.evidence ?? 0 }));
    auditEvents = auditPayload.events || [];
    render();
  } catch { window.location.assign("/"); }
  finally { workspaceLoading = false; }
}
loadFslWorkspace();
window.setInterval(() => {
  if (document.visibilityState === "visible" && !modalRoot.childElementCount && !document.activeElement?.matches("input,textarea,select")) loadFslWorkspace();
}, 15000);
