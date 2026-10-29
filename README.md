# ForensiChain Digital Evidence Portal

This folder contains the complete vanilla frontend and local Node.js backend.

## Run locally

1. Install Node.js 22.13 or later.
2. Open a terminal in this folder.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000`.

The server uses Node's built-in HTTP and SQLite modules, so `npm install` is not required. The first run creates `.data/forensichain.sqlite` and a private `.data/evidence` folder. These contain local demo records and uploaded evidence files; do not commit or publish them.

## Demo accounts

The four accounts shown on the login page are created at first run. Their initial password is `HELLO WORLD`. Passwords are stored as scrypt hashes. Admin-created accounts receive a one-time temporary password in the Admin dashboard. The demo accounts have no password-change screen; use this only as a training prototype, not with real accounts or evidence.

## Pages

- `/` or `/Login%20Page/` opens the sign-in page.
- `/dashboard` redirects a signed-in user to the dashboard for their role.
- Police, FSL, Court and Admin dashboards are individual vanilla HTML/CSS/JS pages under `Frontend/`.

## Prototype custody workflow

Police can upload evidence to an assigned case or create a new case while registering evidence. New case creation and evidence registration are saved together, with a server-assigned case number and custody audit entries. The server calculates SHA-256 again and stores the original file privately. Police can submit a pending record to FSL. FSL uploads the received copy; the server compares its hash with the registered original. A match allows examination to finish with a report summary; a mismatch raises an integrity alert. Court accounts have read-only case, evidence and custody access. Admin accounts manage users and departments and can verify the audit hash chain.

The audit hash chain makes edits detectable when the chain is checked. It is not a digital signature, trusted timestamp, write-once storage control or legal certification. For real forensic use, the system needs a security review, managed identity, encrypted evidence storage, independent key management, backups, retention controls and operational procedures.
