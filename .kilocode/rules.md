# Kilocode Project Rules — Nexus Arena Game Center Management & Rental System

## 1. Architecture & Stack Standards
- **Frontend**: Semantic HTML5, Modern CSS3 (Dark Gaming UI with Neon Blue `#00f0ff` and Cyber Purple `#a855f7` accents), Vanilla ES6+ JavaScript modules.
- **Backend**: PHP 8.3+ strictly typed service-oriented architecture (`src/Config`, `src/Database`, `src/Middleware`, `src/Services`).
- **Database Layer**: Unified Firestore Document & Collection Repository (`FirestoreRepository`) supporting both:
  1. `FirebaseCloudAdapter`: Google Cloud Firestore v1 REST API + Firebase Identity Toolkit REST API + Service Account OAuth2 JWT (`RS256`).
  2. `LocalFirestoreAdapter`: Local transactional SQLite-backed Firestore-compatible document store (`storage/firestore_local.sqlite` + JSON mirror) for offline/zero-credential local operation without losing schema fidelity or ACID transaction safety.

## 2. Security & Data Integrity Rules
- Never store plain-text passwords (`password_hash` with `PASSWORD_BCRYPT`).
- Enforce server-side authentication and role-based authorization (`customer` vs `admin`) on all protected API endpoints.
- Execute all room assignments, VIP booking conflict checks, controller request approvals, and F&B stock deductions/restorations inside atomic database transactions (`runTransaction`).
- Server timestamps and database records are the single source of truth for session timers. Never auto-terminate a paid session upon timer expiration without explicit admin action; mark as `expired` and alert the admin.
- Separate demo seed records (`is_demo: true`) from real operational transactions (`is_demo: false`) with a clear toggle in financial analytics.
