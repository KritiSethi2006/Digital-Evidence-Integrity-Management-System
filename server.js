"use strict";

// ForensiChain local prototype backend. Requires Node.js 22.13+ (node:sqlite).
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { promisify } = require("node:util");
const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const scryptAsync = promisify(scrypt);
const ROOT = __dirname;
const FRONTEND = path.join(ROOT, "Frontend");
const DATA_DIR = path.join(ROOT, ".data");
const EVIDENCE_DIR = path.join(DATA_DIR, "evidence");
const DB_FILE = path.join(DATA_DIR, "forensichain.sqlite");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "HELLO WORLD";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 26 * 1024 * 1024;
const sessions = new Map();
const loginAttempts = new Map();
const ROLE_DASHBOARDS = {
  Police: "/Police%20Dashboard/index.html",
  FSL: "/FSL%20Dashboard/index.html",
  Court: "/Court%20Dashboard/index.html",
  Admin: "/Admin%20Dashboard/index.html"
};

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    employee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Police','FSL','Court','Admin')),
    unit TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    members INTEGER NOT NULL DEFAULT 0,
    cases_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Connected'
  );
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    station TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Standard',
    state TEXT NOT NULL DEFAULT 'Open',
    updated_at TEXT NOT NULL,
    next_hearing TEXT NOT NULL DEFAULT '',
    court_room TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    case_id TEXT NOT NULL REFERENCES cases(id),
    station TEXT NOT NULL,
    added_at TEXT NOT NULL,
    status TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    officer_id TEXT NOT NULL REFERENCES users(employee_id),
    original_path TEXT,
    fsl_received INTEGER NOT NULL DEFAULT 0,
    fsl_received_hash TEXT NOT NULL DEFAULT '',
    fsl_receipt_approved INTEGER NOT NULL DEFAULT 0,
    fsl_exam_completed INTEGER NOT NULL DEFAULT 0,
    fsl_final_hash TEXT NOT NULL DEFAULT '',
    examiner_id TEXT NOT NULL DEFAULT '',
    fsl_report TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS custody_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evidence_id TEXT,
    case_id TEXT,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS evidence_case_idx ON evidence(case_id);
  CREATE INDEX IF NOT EXISTS evidence_status_idx ON evidence(status);
  CREATE INDEX IF NOT EXISTS custody_evidence_idx ON custody_events(evidence_id);
`);
if (!db.prepare("PRAGMA table_info(evidence)").all().some((column) => column.name === "fsl_receipt_approved")) {
  db.exec("ALTER TABLE evidence ADD COLUMN fsl_receipt_approved INTEGER NOT NULL DEFAULT 0");
}
if (!db.prepare("PRAGMA table_info(evidence)").all().some((column) => column.name === "fsl_exam_completed")) {
  db.exec("ALTER TABLE evidence ADD COLUMN fsl_exam_completed INTEGER NOT NULL DEFAULT 0");
}
if (!db.prepare("PRAGMA table_info(evidence)").all().some((column) => column.name === "fsl_final_hash")) {
  db.exec("ALTER TABLE evidence ADD COLUMN fsl_final_hash TEXT NOT NULL DEFAULT ''");
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const nowISO = () => new Date().toISOString();
const userSafe = (row) => row && ({ employeeId: row.employee_id, name: row.name, role: row.role, unit: row.unit, status: row.status });

async function passwordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = Buffer.from(await scryptAsync(password, salt, 64)).toString("hex");
  return { salt, hash };
}

async function passwordMatches(password, salt, expectedHex) {
  const actual = Buffer.from(await scryptAsync(password, salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function auditHash(previousHash, row) {
  return sha256([
    previousHash, row.evidence_id || "", row.case_id || "", row.actor_id,
    row.actor_role, row.action, row.details, row.created_at
  ].join("|"));
}

function addAudit({ evidenceId = null, caseId = null, actorId, actorRole, action, details = {} }) {
  const previousHash = db.prepare("SELECT event_hash FROM custody_events ORDER BY id DESC LIMIT 1").get()?.event_hash || "GENESIS";
  const row = {
    evidence_id: evidenceId,
    case_id: caseId,
    actor_id: actorId,
    actor_role: actorRole,
    action,
    details: JSON.stringify(details),
    created_at: nowISO(),
    previous_hash: previousHash
  };
  const insert = db.prepare(`INSERT INTO custody_events
    (evidence_id,case_id,actor_id,actor_role,action,details,created_at,previous_hash,event_hash)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const result = insert.run(row.evidence_id, row.case_id, row.actor_id, row.actor_role, row.action,
    row.details, row.created_at, row.previous_hash, auditHash(previousHash, row));
  return Number(result.lastInsertRowid);
}

async function seedDatabase() {
  const hasUsers = db.prepare("SELECT 1 AS yes FROM users LIMIT 1").get();
  if (hasUsers) return;
  const demoUsers = [
    ["POL-1042", "Raman Sharma", "Police", "Central Police Station"],
    ["FSL-2076", "Dr. Meera Nair", "FSL", "Digital Forensics Division"],
    ["COURT-0312", "Justice A. Menon", "Court", "District Court"],
    ["ADM-0001", "Portal Administrator", "Admin", "System Administration"]
  ];
  const insertUser = db.prepare(`INSERT INTO users (employee_id,name,role,unit,status,password_salt,password_hash,created_at)
    VALUES (?,?,?,?,'Active',?,?,?)`);
  for (const [id, name, role, unit] of demoUsers) {
    const password = await passwordRecord(DEMO_PASSWORD);
    insertUser.run(id, name, role, unit, password.salt, password.hash, nowISO());
  }
  const insertDepartment = db.prepare("INSERT INTO departments (name,type,members,cases_count,status) VALUES (?,?,?,?,?)");
  [
    ["Central Police Station", "Police unit", 18, 42, "Connected"],
    ["North Division", "Police unit", 12, 28, "Connected"],
    ["Digital Forensics Division", "FSL unit", 9, 35, "Connected"],
    ["District Court", "Judicial unit", 7, 64, "Connected"]
  ].forEach((row) => insertDepartment.run(...row));
  const insertCase = db.prepare(`INSERT INTO cases (id,title,station,priority,state,updated_at,next_hearing,court_room)
    VALUES (?,?,?,?,?,?,?,?)`);
  [
    ["CR-2026-0184", "Unauthorised access investigation", "Central Police Station", "High", "Evidence review", "24 Oct 2026", "28 Oct 2026", "Courtroom 2"],
    ["CR-2026-0181", "Digital device examination", "North Division", "Standard", "At laboratory", "24 Oct 2026", "30 Oct 2026", "Courtroom 1"],
    ["CR-2026-0176", "Witness statement record", "Central Police Station", "Standard", "Verified", "23 Oct 2026", "02 Nov 2026", "Courtroom 3"],
    ["CR-2026-0168", "Mobile device integrity review", "South Division", "Urgent", "Review required", "23 Oct 2026", "04 Nov 2026", "Courtroom 2"]
  ].forEach((row) => insertCase.run(...row));
  const insertEvidence = db.prepare(`INSERT INTO evidence
    (id,name,type,case_id,station,added_at,status,sha256,officer_id,fsl_received,fsl_received_hash,examiner_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const sample = [
    ["EV-2026-0042", "CCTV_entrance_01.mp4", "Video", "CR-2026-0184", "Central Police Station", "24 Oct 2026 · 10:42", "Awaiting SHO approval", "3b7c4e2a" + "a91d0f6c".repeat(1), "POL-1042", 0, "", ""],
    ["EV-2026-0041", "device_extraction.zip", "Archive", "CR-2026-0181", "North Division", "24 Oct 2026 · 09:18", "At FSL", "8f0d2b61" + "6c34bb10", "POL-1042", 0, "", "FSL-2076"],
    ["EV-2026-0038", "statement_scan.pdf", "Document", "CR-2026-0176", "Central Police Station", "23 Oct 2026 · 16:06", "Verified", "da19a4ce" + "902fe711", "POL-1042", 1, "da19a4ce902fe711", "FSL-2076"],
    ["EV-2026-0035", "mobile_image.E01", "Forensic image", "CR-2026-0168", "South Division", "23 Oct 2026 · 12:30", "Integrity alert", "Mismatch detected", "POL-1042", 0, "", "FSL-2076"]
  ];
  for (const row of sample) insertEvidence.run(...row);
  for (const item of sample) addAudit({ evidenceId: item[0], caseId: item[3], actorId: item[8], actorRole: "Police", action: "Evidence record seeded", details: { status: item[6] } });
}

function sendJSON(res, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(body);
}

function sendError(res, status, message) { sendJSON(res, status, { error: message }); }

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self' https: data:; script-src 'self'; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob:; font-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}

async function readBody(req, limit = 1024 * 1024) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > limit) throw Object.assign(new Error("Request body is too large."), { status: 413 });
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJSON(req) {
  const type = String(req.headers["content-type"] || "");
  if (!type.toLowerCase().includes("application/json")) throw Object.assign(new Error("Send JSON data."), { status: 415 });
  const body = await readBody(req);
  try { return JSON.parse(body.toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("Invalid JSON."), { status: 400 }); }
}

async function readFormData(req) {
  const type = String(req.headers["content-type"] || "");
  if (!type.toLowerCase().includes("multipart/form-data")) throw Object.assign(new Error("Send a multipart form."), { status: 415 });
  const body = await readBody(req, MAX_BODY_BYTES);
  const parsed = new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body
  });
  return parsed.formData();
}

function cookieMap(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sessionFor(req) {
  const token = cookieMap(req.headers.cookie).fc_session;
  if (!token) return null;
  const key = sha256(token);
  const session = sessions.get(key);
  if (!session || session.expiresAt <= Date.now()) { sessions.delete(key); return null; }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return db.prepare("SELECT * FROM users WHERE employee_id=? AND status='Active'").get(session.employeeId) || null;
}

function requireOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let parsed;
  try { parsed = new URL(origin); } catch { throw Object.assign(new Error("Invalid request origin."), { status: 403 }); }
  if (parsed.host !== req.headers.host) throw Object.assign(new Error("Cross-origin request blocked."), { status: 403 });
}

function requireRole(user, roles) {
  if (!user) throw Object.assign(new Error("Please sign in first."), { status: 401 });
  if (roles && !roles.includes(user.role)) throw Object.assign(new Error("Your account does not have permission for this action."), { status: 403 });
}

function evidenceDTO(row) {
  const officer = db.prepare("SELECT name FROM users WHERE employee_id=?").get(row.officer_id)?.name || row.officer_id;
  const receivedFrom = `${row.station} · ${officer}`;
  const seal = row.status === "Verified" ? "Seal verified" : row.status === "Integrity alert" ? "Review required" : "Seal recorded";
  return {
    id: row.id, name: row.name, file: row.name, caseId: row.case_id, type: row.type,
    station: row.station, added: row.added_at, received: row.added_at, submitted: row.added_at,
    status: row.status, hash: row.sha256, officer, officerId: row.officer_id,
    receivedFrom, submittedBy: row.station, examiner: row.examiner_id || "Unassigned",
    fslReceived: Boolean(row.fsl_received), fslReceivedHash: row.fsl_received_hash || "", fslReport: row.fsl_report,
    fslExamCompleted: Boolean(row.fsl_exam_completed), fslFinalHash: row.fsl_final_hash || "",
    fslApproved: row.status === "Verified",
    fslReceiptApproved: Boolean(row.fsl_receipt_approved),
    sealed: seal, role: "Police", date: row.added_at, originalAvailable: Boolean(row.original_path)
  };
}

function allowedEvidenceQuery(user) {
  if (user.role === "Police") return db.prepare(`SELECT * FROM evidence WHERE station=? OR officer_id=? ORDER BY added_at DESC`)
    .all(user.unit, user.employee_id);
  if (user.role === "FSL") return db.prepare("SELECT * FROM evidence WHERE status IN ('At FSL','Verified','Integrity alert') ORDER BY added_at DESC").all();
  return db.prepare("SELECT * FROM evidence ORDER BY added_at DESC").all();
}

function allowedCasesQuery(user) {
  let rows;
  if (user.role === "Police") rows = db.prepare("SELECT * FROM cases WHERE station=? ORDER BY updated_at DESC").all(user.unit);
  else rows = db.prepare("SELECT * FROM cases ORDER BY updated_at DESC").all();
  return rows.map((item) => {
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM evidence WHERE case_id=?").get(item.id).count);
    return { id: item.id, title: item.title, station: item.station, priority: item.priority, state: item.state,
      updated: item.updated_at, hearing: item.next_hearing, next_hearing: item.next_hearing, court: item.court_room,
      court_room: item.court_room, evidence: count, evidenceCount: count };
  });
}

function auditRowsFor(user) {
  if (user.role === "Admin" || user.role === "Court") return db.prepare("SELECT * FROM custody_events ORDER BY id DESC LIMIT 100").all();
  if (user.role === "Police") return db.prepare(`SELECT a.* FROM custody_events a LEFT JOIN evidence e ON e.id=a.evidence_id
    WHERE a.actor_id=? OR e.station=? ORDER BY a.id DESC LIMIT 100`).all(user.employee_id, user.unit);
  return db.prepare(`SELECT a.* FROM custody_events a LEFT JOIN evidence e ON e.id=a.evidence_id
    WHERE e.status IN ('At FSL','Verified','Integrity alert') OR a.actor_id=? ORDER BY a.id DESC LIMIT 100`).all(user.employee_id);
}

function auditDTO(row) {
  let details = {};
  try { details = JSON.parse(row.details); } catch { /* Keep an empty detail object for malformed legacy rows. */ }
  const actor = db.prepare("SELECT name FROM users WHERE employee_id=?").get(row.actor_id)?.name || row.actor_id;
  return { id: row.id, action: row.action, actorId: row.actor_id, actorRole: row.actor_role, actor: `${row.actor_id} · ${actor}`,
    evidenceId: row.evidence_id, caseId: row.case_id, item: [row.evidence_id, row.case_id].filter(Boolean).join(" · "),
    details, time: new Date(row.created_at).toLocaleString("en-IN"), createdAt: row.created_at,
    previousHash: row.previous_hash, eventHash: row.event_hash, kind: row.action.toLowerCase().includes("integrity") ? "alert" : "" };
}

function verifyAuditChain() {
  const rows = db.prepare("SELECT * FROM custody_events ORDER BY id ASC").all();
  let previous = "GENESIS";
  for (const row of rows) {
    if (row.previous_hash !== previous || auditHash(previous, row) !== row.event_hash) return { valid: false, checked: rows.length, brokenAt: row.id };
    previous = row.event_hash;
  }
  return { valid: true, checked: rows.length, head: previous };
}

function updateEvidenceStatus(id, status, fields = {}) {
  const allowedFields = ["fsl_received", "fsl_received_hash", "fsl_receipt_approved", "fsl_exam_completed", "fsl_final_hash", "examiner_id", "fsl_report"];
  const entries = Object.entries(fields).filter(([key]) => allowedFields.includes(key));
  const setFields = entries.map(([key]) => `${key}=?`).join(", ");
  const sql = `UPDATE evidence SET status=?${setFields ? `, ${setFields}` : ""} WHERE id=?`;
  db.prepare(sql).run(status, ...entries.map(([, value]) => value), id);
}

async function handleLogin(req, res) {
  requireOrigin(req);
  const ip = req.socket.remoteAddress || "unknown";
  const record = loginAttempts.get(ip) || { count: 0, reset: Date.now() + 10 * 60 * 1000 };
  if (record.reset < Date.now()) { record.count = 0; record.reset = Date.now() + 10 * 60 * 1000; }
  if (record.count >= 8) { loginAttempts.set(ip, record); return sendError(res, 429, "Too many attempts. Wait ten minutes and try again."); }
  const body = await readJSON(req);
  const employeeId = String(body.employeeId || "").trim().toUpperCase();
  const password = String(body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE employee_id=?").get(employeeId);
  const valid = user && user.status === "Active" && await passwordMatches(password, user.password_salt, user.password_hash);
  if (!valid) {
    record.count += 1;
    loginAttempts.set(ip, record);
    return sendError(res, 401, "Employee ID or password is incorrect.");
  }
  loginAttempts.delete(ip);
  const sessionToken = randomBytes(32).toString("base64url");
  sessions.set(sha256(sessionToken), { employeeId, expiresAt: Date.now() + SESSION_TTL_MS });
  addAudit({ actorId: user.employee_id, actorRole: user.role, action: "Signed in", details: { unit: user.unit } });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `fc_session=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
  sendJSON(res, 200, { user: userSafe(user), redirect: "/dashboard" });
}

async function handleUpload(req, res, user) {
  requireOrigin(req);
  requireRole(user, ["Police"]);
  const form = await readFormData(req);
  const uploaded = form.get("evidenceFile");
  const requestedCaseId = String(form.get("caseId") || "").trim().toUpperCase();
  const isNewCase = requestedCaseId === "__NEW_CASE__";
  const newCaseTitle = String(form.get("newCaseTitle") || "").trim();
  const newCasePriority = String(form.get("newCasePriority") || "Standard");
  const clientHash = String(form.get("clientHash") || "").trim().toLowerCase();
  if (!uploaded || typeof uploaded.arrayBuffer !== "function" || uploaded.size === 0) return sendError(res, 400, "Choose a non-empty evidence file.");
  if (uploaded.size > 25 * 1024 * 1024) return sendError(res, 413, "The demo upload limit is 25 MB.");
  if (isNewCase && (newCaseTitle.length < 3 || newCaseTitle.length > 150)) return sendError(res, 400, "Enter a new case title between 3 and 150 characters.");
  if (isNewCase && !["Standard", "High", "Urgent"].includes(newCasePriority)) return sendError(res, 400, "Choose a valid priority for the new case.");
  let caseId = requestedCaseId;
  if (!isNewCase) {
    const caseRow = db.prepare("SELECT * FROM cases WHERE id=?").get(caseId);
    if (!caseRow) return sendError(res, 404, "That case ID was not found. Choose an existing case or select Create a new case.");
    if (caseRow.station !== user.unit) return sendError(res, 403, "You can register evidence only for a case assigned to your unit.");
  }
  const fileBuffer = Buffer.from(await uploaded.arrayBuffer());
  const serverHash = sha256(fileBuffer);
  if (clientHash && clientHash !== serverHash) return sendError(res, 400, "The browser and server file hashes do not match.");
  const extension = path.extname(uploaded.name || "").replace(/[^.a-zA-Z0-9]/g, "").slice(0, 12);
  const storageName = `${randomUUID()}${extension}`;
  const storagePath = path.join(EVIDENCE_DIR, storageName);
  const mime = String(uploaded.type || "").toLowerCase();
  const type = mime.startsWith("video/") ? "Video" : mime.startsWith("image/") ? "Image" : mime.includes("zip") ? "Archive" : "Document";
  const added = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  let transactionOpen = false;
  let id;
  try {
    await fs.promises.writeFile(storagePath, fileBuffer, { flag: "wx", mode: 0o600 });
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    if (isNewCase) {
      const nextCaseNumber = Number(db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id,9) AS INTEGER)),183)+1 AS next FROM cases WHERE id LIKE 'CR-2026-%'").get().next);
      caseId = `CR-2026-${String(nextCaseNumber).padStart(4, "0")}`;
      db.prepare(`INSERT INTO cases (id,title,station,priority,state,updated_at,next_hearing,court_room)
        VALUES (?,?,?,?,?,?,?,?)`).run(caseId, newCaseTitle, user.unit, newCasePriority, "Evidence review", added, "", "");
      db.prepare("UPDATE departments SET cases_count=cases_count+1 WHERE name=?").run(user.unit);
      addAudit({ caseId, actorId: user.employee_id, actorRole: user.role, action: "Case created with evidence registration", details: { title: newCaseTitle, priority: newCasePriority } });
    }
    const nextNumber = Number(db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id,9) AS INTEGER)),42)+1 AS next FROM evidence").get().next);
    id = `EV-2026-${String(nextNumber).padStart(4, "0")}`;
    db.prepare(`INSERT INTO evidence (id,name,type,case_id,station,added_at,status,sha256,officer_id,original_path)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, path.basename(uploaded.name), type, caseId, user.unit, added, "Awaiting SHO approval", serverHash, user.employee_id, storagePath);
    db.prepare("UPDATE cases SET updated_at=?, state='Evidence review' WHERE id=?").run(added, caseId);
    addAudit({ evidenceId: id, caseId, actorId: user.employee_id, actorRole: user.role, action: "Evidence registered", details: { sha256: serverHash, file: path.basename(uploaded.name) } });
    db.exec("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) db.exec("ROLLBACK");
    await fs.promises.rm(storagePath, { force: true });
    throw error;
  }
  const savedCase = db.prepare("SELECT * FROM cases WHERE id=?").get(caseId);
  sendJSON(res, 201, {
    evidence: evidenceDTO(db.prepare("SELECT * FROM evidence WHERE id=?").get(id)),
    case: { id: savedCase.id, title: savedCase.title, station: savedCase.station, priority: savedCase.priority,
      state: savedCase.state, updated: savedCase.updated_at, hearing: savedCase.next_hearing, court: savedCase.court_room,
      evidence: Number(db.prepare("SELECT COUNT(*) AS count FROM evidence WHERE case_id=?").get(caseId).count) },
    createdCase: isNewCase
  });
}

async function handleReceive(req, res, user, id) {
  requireOrigin(req);
  requireRole(user, ["FSL"]);
  const row = db.prepare("SELECT * FROM evidence WHERE id=?").get(id);
  if (!row) return sendError(res, 404, "Evidence record was not found.");
  if (row.status !== "At FSL") return sendError(res, 409, "This record is not waiting for FSL receipt.");
  const form = await readFormData(req);
  const uploaded = form.get("receivedFile");
  if (!uploaded || typeof uploaded.arrayBuffer !== "function" || uploaded.size === 0) return sendError(res, 400, "Choose the received evidence file to verify its hash.");
  if (uploaded.size > 25 * 1024 * 1024) return sendError(res, 413, "The demo verification limit is 25 MB.");
  const receivedHash = sha256(Buffer.from(await uploaded.arrayBuffer()));
  const matches = receivedHash === row.sha256;
  updateEvidenceStatus(id, matches ? "At FSL" : "Integrity alert", {
    fsl_received: matches ? 1 : 0,
    fsl_received_hash: receivedHash,
    fsl_receipt_approved: matches ? 1 : 0,
    fsl_exam_completed: 0,
    fsl_final_hash: "",
    examiner_id: user.employee_id
  });
  addAudit({ evidenceId: id, caseId: row.case_id, actorId: user.employee_id, actorRole: user.role,
    action: matches ? "FSL intake accepted; SHA-256 matched and examination started" : "Integrity mismatch at FSL intake",
    details: { expectedHash: row.sha256, receivedHash, matches } });
  sendJSON(res, 200, { evidence: evidenceDTO(db.prepare("SELECT * FROM evidence WHERE id=?").get(id)), hashMatches: matches,
    message: matches ? "Intake accepted. SHA-256 matches the Police registration; examination has started." : "Hash mismatch detected. Integrity alert recorded." });
}

async function handleFinalVerification(req, res, user, id) {
  requireOrigin(req);
  requireRole(user, ["FSL"]);
  const row = db.prepare("SELECT * FROM evidence WHERE id=?").get(id);
  if (!row) return sendError(res, 404, "Evidence record was not found.");
  if (row.status !== "At FSL" || !row.fsl_received || !row.fsl_exam_completed || row.fsl_received_hash !== row.sha256) {
    return sendError(res, 409, "Complete intake and examination before final hash verification.");
  }
  const form = await readFormData(req);
  const uploaded = form.get("receivedFile");
  if (!uploaded || typeof uploaded.arrayBuffer !== "function" || uploaded.size === 0) return sendError(res, 400, "Choose the examined evidence file for final verification.");
  if (uploaded.size > 25 * 1024 * 1024) return sendError(res, 413, "The demo verification limit is 25 MB.");
  const finalHash = sha256(Buffer.from(await uploaded.arrayBuffer()));
  const matches = finalHash === row.sha256;
  updateEvidenceStatus(id, matches ? "Verified" : "Integrity alert", { fsl_final_hash: finalHash, examiner_id: user.employee_id });
  if (matches) db.prepare("UPDATE cases SET state='FSL approved',updated_at=? WHERE id=?").run(new Date().toLocaleString("en-IN"), row.case_id);
  addAudit({ evidenceId: id, caseId: row.case_id, actorId: user.employee_id, actorRole: user.role,
    action: matches ? "FSL approved after final SHA-256 verification" : "Integrity mismatch after examination",
    details: { expectedHash: row.sha256, finalHash, matches, report: row.fsl_report } });
  sendJSON(res, 200, { evidence: evidenceDTO(db.prepare("SELECT * FROM evidence WHERE id=?").get(id)), hashMatches: matches,
    message: matches ? "Final hash matches the Police registration. FSL approved." : "Final hash mismatch detected. Integrity alert recorded." });
}

async function handleEvidenceAction(req, res, user, id) {
  requireOrigin(req);
  const body = await readJSON(req);
  const row = db.prepare("SELECT * FROM evidence WHERE id=?").get(id);
  if (!row) return sendError(res, 404, "Evidence record was not found.");

  if (body.action === "send-to-fsl") {
    requireRole(user, ["Police"]);
    if (row.status !== "Awaiting SHO approval") return sendError(res, 409, "This record is not awaiting SHO approval.");
    updateEvidenceStatus(id, "At FSL");
    addAudit({ evidenceId: id, caseId: row.case_id, actorId: user.employee_id, actorRole: user.role, action: "SHO approval recorded; sent to FSL", details: {} });
    return sendJSON(res, 200, { evidence: evidenceDTO(db.prepare("SELECT * FROM evidence WHERE id=?").get(id)) });
  }

  if (body.action === "approve-receipt") {
    requireRole(user, ["FSL"]);
    return sendError(res, 409, "FSL approval is available only after examination and final hash verification.");
  }

  if (body.action === "complete-examination") {
    requireRole(user, ["FSL"]);
    if (row.status !== "At FSL" || !row.fsl_received || row.fsl_exam_completed || row.fsl_received_hash !== row.sha256) return sendError(res, 409, "Accept the intake with a matching hash before completing examination.");
    const report = String(body.report || "").trim();
    if (report.length < 8 || report.length > 3000) return sendError(res, 400, "Enter an examination summary between 8 and 3000 characters.");
    updateEvidenceStatus(id, "At FSL", { examiner_id: user.employee_id, fsl_report: report, fsl_exam_completed: 1 });
    addAudit({ evidenceId: id, caseId: row.case_id, actorId: user.employee_id, actorRole: user.role, action: "FSL examination completed; final hash verification pending", details: { report } });
    return sendJSON(res, 200, { evidence: evidenceDTO(db.prepare("SELECT * FROM evidence WHERE id=?").get(id)) });
  }
  sendError(res, 400, "Unknown evidence action.");
}

async function handleAPI(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/api/health" && req.method === "GET") return sendJSON(res, 200, { ok: true, service: "ForensiChain demo backend" });
  if (pathname === "/api/auth/login" && req.method === "POST") return handleLogin(req, res);
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    requireOrigin(req);
    const token = cookieMap(req.headers.cookie).fc_session;
    if (token) sessions.delete(sha256(token));
    res.setHeader("Set-Cookie", "fc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    return sendJSON(res, 200, { ok: true });
  }
  const user = sessionFor(req);
  if (pathname === "/api/auth/me" && req.method === "GET") {
    if (!user) return sendError(res, 401, "Not signed in.");
    return sendJSON(res, 200, { user: userSafe(user) });
  }
  requireRole(user);

  if (pathname === "/api/dashboard/overview" && req.method === "GET") {
    const rows = allowedEvidenceQuery(user).map(evidenceDTO);
    return sendJSON(res, 200, { user: userSafe(user), evidence: rows, cases: allowedCasesQuery(user), generatedAt: nowISO() });
  }
  if (pathname === "/api/evidence" && req.method === "GET") return sendJSON(res, 200, { evidence: allowedEvidenceQuery(user).map(evidenceDTO) });
  if (pathname === "/api/evidence" && req.method === "POST") return handleUpload(req, res, user);
  if (pathname === "/api/cases" && req.method === "GET") return sendJSON(res, 200, { cases: allowedCasesQuery(user) });
  if (pathname === "/api/departments" && req.method === "GET") {
    requireRole(user, ["Admin"]);
    return sendJSON(res, 200, { departments: db.prepare("SELECT id,name,type,members,cases_count AS cases,status FROM departments ORDER BY name").all() });
  }
  if (pathname === "/api/departments" && req.method === "POST") {
    requireOrigin(req); requireRole(user, ["Admin"]);
    const body = await readJSON(req);
    const name = String(body.name || "").trim(); const type = String(body.type || "").trim();
    if (name.length < 3 || name.length > 100 || !["Police unit","FSL unit","Judicial unit","Administration"].includes(type)) return sendError(res, 400, "Enter a department name and a valid unit type.");
    try { db.prepare("INSERT INTO departments (name,type,members,cases_count,status) VALUES (?,?,0,0,'Connected')").run(name, type); }
    catch { return sendError(res, 409, "That department already exists."); }
    addAudit({ actorId: user.employee_id, actorRole: user.role, action: "Department added", details: { name, type } });
    return sendJSON(res, 201, { department: db.prepare("SELECT id,name,type,members,cases_count AS cases,status FROM departments WHERE name=?").get(name) });
  }
  if (pathname === "/api/users" && req.method === "GET") {
    requireRole(user, ["Admin"]);
    return sendJSON(res, 200, { users: db.prepare("SELECT employee_id AS employeeId,name,role,unit,status,created_at AS createdAt FROM users ORDER BY role,employee_id").all() });
  }
  if (pathname === "/api/users" && req.method === "POST") {
    requireOrigin(req); requireRole(user, ["Admin"]);
    const body = await readJSON(req);
    const id = String(body.employeeId || "").trim().toUpperCase();
    const name = String(body.name || "").trim(); const role = String(body.role || ""); const unit = String(body.unit || "").trim();
    if (!/^[A-Z0-9-]{3,32}$/.test(id) || name.length < 2 || name.length > 100 || !["Police","FSL","Court","Admin"].includes(role) || unit.length < 2 || unit.length > 120) return sendError(res, 400, "Enter a valid employee ID, name, role and unit.");
    const unitExists = db.prepare("SELECT 1 FROM departments WHERE name=?").get(unit);
    if (!unitExists && !(role === "Admin" && unit === "System Administration")) return sendError(res, 400, "Select a registered department for this user.");
    if (db.prepare("SELECT 1 FROM users WHERE employee_id=?").get(id)) return sendError(res, 409, "That employee ID already exists.");
    const temporaryPassword = randomBytes(9).toString("base64url");
    const password = await passwordRecord(temporaryPassword);
    db.prepare("INSERT INTO users (employee_id,name,role,unit,status,password_salt,password_hash,created_at) VALUES (?,?,?,?,'Active',?,?,?)")
      .run(id, name, role, unit, password.salt, password.hash, nowISO());
    db.prepare("UPDATE departments SET members=members+1 WHERE name=?").run(unit);
    addAudit({ actorId: user.employee_id, actorRole: user.role, action: "Portal user added", details: { employeeId: id, role, unit } });
    return sendJSON(res, 201, { user: userSafe(db.prepare("SELECT * FROM users WHERE employee_id=?").get(id)), temporaryPassword });
  }
  const userMatch = pathname.match(/^\/api\/users\/([A-Z0-9-]+)$/i);
  if (userMatch && req.method === "PATCH") {
    requireOrigin(req); requireRole(user, ["Admin"]);
    const id = userMatch[1].toUpperCase(); const body = await readJSON(req); const row = db.prepare("SELECT * FROM users WHERE employee_id=?").get(id);
    if (!row) return sendError(res, 404, "User account was not found.");
    if (!['Active','Inactive'].includes(body.status)) return sendError(res, 400, "Status must be Active or Inactive.");
    if (id === user.employee_id && body.status === "Inactive") return sendError(res, 409, "You cannot disable your own current administrator account.");
    if (row.role === "Admin" && body.status === "Inactive" && Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='Admin' AND status='Active'").get().count) <= 1) return sendError(res, 409, "At least one active administrator must remain.");
    db.prepare("UPDATE users SET status=? WHERE employee_id=?").run(body.status, id);
    addAudit({ actorId: user.employee_id, actorRole: user.role, action: `Account ${body.status.toLowerCase()}`, details: { employeeId: id, role: row.role } });
    return sendJSON(res, 200, { user: userSafe(db.prepare("SELECT * FROM users WHERE employee_id=?").get(id)) });
  }
  if (pathname === "/api/audit" && req.method === "GET") {
    const rows = auditRowsFor(user);
    return sendJSON(res, 200, { events: rows.map(auditDTO), integrity: user.role === "Admin" ? verifyAuditChain() : undefined });
  }
  const receiveMatch = pathname.match(/^\/api\/evidence\/([^/]+)\/receive$/);
  if (receiveMatch && req.method === "POST") return handleReceive(req, res, user, receiveMatch[1]);
  const finalVerificationMatch = pathname.match(/^\/api\/evidence\/([^/]+)\/final-verification$/);
  if (finalVerificationMatch && req.method === "POST") return handleFinalVerification(req, res, user, finalVerificationMatch[1]);
  const evidenceActionMatch = pathname.match(/^\/api\/evidence\/([^/]+)\/actions$/);
  if (evidenceActionMatch && req.method === "POST") return handleEvidenceAction(req, res, user, evidenceActionMatch[1]);
  sendError(res, 404, "API route not found.");
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff"
};

async function serveFrontend(req, res, url) {
  let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!relative) relative = "Login Page/index.html";
  if (relative === "dashboard") {
    const user = sessionFor(req);
    if (!user) { res.writeHead(302, { Location: "/" }); return res.end(); }
    res.writeHead(302, { Location: ROLE_DASHBOARDS[user.role] });
    return res.end();
  }
  if (relative.endsWith("/")) relative += "index.html";
  const filePath = path.resolve(FRONTEND, relative);
  if (!filePath.startsWith(FRONTEND + path.sep)) return sendError(res, 403, "Path is outside the frontend directory.");
  let stats;
  try { stats = await fs.promises.stat(filePath); } catch { return sendError(res, 404, "Page not found."); }
  if (!stats.isFile()) return sendError(res, 404, "Page not found.");
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(filePath).pipe(res);
}

async function handle(req, res) {
  setSecurityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleAPI(req, res, url);
  if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "Method not allowed.");
  return serveFrontend(req, res, url);
}

async function start() {
  await seedDatabase();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) return res.destroy(error);
      sendError(res, error.status || 500, error.status ? error.message : "Unexpected server error.");
      if (!error.status) console.error(error);
    });
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  server.listen(PORT, HOST, () => {
    console.log(`ForensiChain portal running at http://${HOST}:${PORT}`);
    console.log(`Demo password: ${DEMO_PASSWORD}`);
  });
}

start().catch((error) => { console.error("Could not start ForensiChain backend:", error); process.exitCode = 1; });
