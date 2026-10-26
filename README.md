# NEXUS ARENA — Game Center Management & Console Rental System

A complete, responsive, full-stack web application for managing a console gaming lounge and VIP rental business. Built with **HTML5, CSS3, Vanilla ES6+ JavaScript, PHP 8.3+, and a Dual-Adapter Firebase / Local Firestore ACID Persistence Layer**.

---

## 1. Architecture & Firebase + PHP Integration Summary

### How PHP & Firebase Work Together
- **Cloud Firestore REST API v1 & Firebase Auth REST API (`src/Database/FirebaseCloudAdapter.php`)**:
  - Uses PHP's native `curl` and `openssl` extensions (avoiding the Windows `grpc` C-extension limitation of `google/cloud-firestore`).
  - Signs Service Account OAuth2 JWTs (`RS256`) on the trusted PHP server and interacts directly with `firestore.googleapis.com` and `identitytoolkit.googleapis.com`.
- **Zero-Config Local Firestore ACID Engine (`src/Database/LocalFirestoreAdapter.php`)**:
  - When `DB_DRIVER=auto` and no cloud credentials are present in `.env`, the system uses an ACID SQLite WAL document store (`storage/firestore_local.sqlite` + `storage/firestore_mirror.json`) implementing the **exact same 18 Firestore collections**, document schemas, and atomic transactions (`runTransaction`).
  - The active storage mode is displayed transparently in the top bar and Admin Settings page — Firebase is never silently replaced.

---

## 2. Folder Structure

```text
d:\Cursor\Automation\
├── public/
│   ├── index.php               # Main responsive web application shell
│   ├── api.php                 # Unified JSON REST API & CSV export endpoint
│   └── assets/
│       ├── css/style.css       # Dark Neon Gaming UI theme (Desktop/Tablet/Mobile)
│       └── js/
│           ├── app.js          # Core state, auth, server-synced timer ticker, modals
│           ├── customer.js     # All 10 Customer pages/views
│           └── admin.js        # All 12 Admin pages/views
├── src/
│   ├── bootstrap.php           # PSR-4 autoloader, .env loader, session initializer
│   ├── Config/Env.php          # Environment variable parser
│   ├── Database/
│   │   ├── FirestoreInterface.php
│   │   ├── LocalFirestoreAdapter.php   # Local ACID SQLite Firestore document store
│   │   ├── FirebaseCloudAdapter.php    # Google Cloud Firestore v1 REST + JWT driver
│   │   ├── FirestoreRepository.php     # Driver selector & singleton
│   │   └── Seeder.php                  # Clearly labeled demo seed data (`is_demo: true`)
│   ├── Middleware/
│   │   └── AuthMiddleware.php          # Session + Bearer HMAC token & Admin RBAC guard
│   └── Services/
│       ├── AuthService.php             # BCRYPT auth, registration, profile & user admin
│       ├── RoomQueueService.php        # Rooms, authoritative timers, queue & auto-notify
│       ├── BookingService.php          # VIP booking pricing, overlap conflict guard
│       ├── CatalogService.php          # Game catalog, `room_games` mapping, controllers
│       ├── OrderService.php            # F&B cart checkout, atomic stock deduct/restore, audit
│       ├── FinanceService.php          # Revenue, expenses, profit reports & CSV export
│       ├── SupportService.php          # AI Chatbot (live DB + optional LLM) & Human Support
│       └── FeedbackService.php         # Ratings, reviews, complaints, duplicate review guard
├── docs/
│   └── FIREBASE_SETUP.md       # Detailed Firebase project & security rules setup guide
├── tests/
│   └── run_tests.php           # 36-assertion automated integration & concurrency test suite
├── .kilocode/rules.md          # Kilocode architecture & development rules
├── firestore.rules             # Firestore production security rules
├── firestore.indexes.json      # Firestore composite indexes
├── .env.example                # Example environment configuration (no secrets)
├── php.ini                     # PHP 8.3 configuration (curl, openssl, pdo_sqlite, mbstring)
├── router.php                  # Built-in PHP server router
├── start-server.ps1            # One-click PowerShell server launcher
└── start-server.bat            # One-click Windows Batch server launcher
```

---

## 3. Setup & Running Instructions

### Prerequisites
- **PHP 8.1 / 8.3+** with `curl`, `openssl`, `mbstring`, `pdo_sqlite`, and `sqlite3` enabled (already configured in the included `php.ini`).

### Step 1: Configure Environment Variables
Copy `.env.example` to `.env` (already created for local development):
```powershell
Copy-Item .env.example .env
```

### Step 2: Start the Application Server
Run the included startup script from PowerShell or Command Prompt:
```powershell
.\start-server.ps1
```
Or run PHP directly:
```powershell
php -c php.ini -S localhost:8000 router.php
```
Then open **[http://localhost:8000](http://localhost:8000)** in your browser.

### Step 3: Demo Accounts (1-Click Switcher Available in UI)
Click **Sign In / Demo Login** in the top-right corner of the web app to switch roles in 1 click, or enter:
- **Administrator**: `admin@nexusarena.gg` / `Admin@123`
- **Customer 1 (Active Session in Room 101)**: `alex@gamer.gg` / `Customer@123`
- **Customer 2 (VIP Booking)**: `maya@gamer.gg` / `Customer@123`
- **Customer 3 (Waiting in Queue)**: `ryan@gamer.gg` / `Customer@123`

---

## 4. Running Automated Tests

Run the full 36-assertion integration test suite covering authentication, RBAC, room timers, queue auto-promotion, VIP booking conflict prevention, exact game-to-room mapping, controller inventory locking, F&B stock deduction/restoration, financial profit math, CSV export, AI chatbot, human support chat, and duplicate session review prevention:

```powershell
php -c php.ini tests/run_tests.php
```

---

## 5. Summary of Implemented Features

### Customer Portal (10 Modules)
1. **Home / Dashboard**: Live room counters, active session banner with server-synced countdown, VIP highlights, and community ratings.
2. **Room Availability & Queue**: Card-based room display with status badges, consoles, mapped games, available controllers, live countdowns, "All Regular Rooms Occupied" alert banner, and live waiting queue join/cancel.
3. **VIP Suite Booking**: Dedicated VIP booking form with configurable rates/durations, automatic price calculator, overlap conflict prevention, and booking status tracker.
4. **Game Catalog**: Search & filter by title, genre, platform, and room; displays exact rooms where each game is installed (`room_games`).
5. **Food & Beverage Menu**: Browse items with real-time stock indicators, interactive cart with quantity controls, room delivery selector, and atomic order checkout.
6. **My Orders & Session**: Server-synchronized session timer, "Request Additional Controllers" form with live availability check, and F&B order status history.
7. **AI Concierge Chatbot**: Answers questions about available rooms, game locations, VIP rates, controllers, F&B menu, queues, and opening hours using live database records (with clearly labeled Live-DB FAQ fallback when no external AI key is configured).
8. **Human Admin Support Chat**: Separate real-time support thread linked to the customer and their active room, showing admin online status, timestamps, and read receipts.
9. **Ratings & Feedback**: Submit 1–5 star ratings, public reviews, private complaints, and suggestions linked to sessions, with duplicate review prevention.
10. **Profile & Booking History**: Update profile details/password and review historical sessions and VIP bookings.

### Admin Command Center (12 Modules)
1. **Admin Dashboard**: Live KPIs, expired/low-time session alerts, low-stock F&B warnings, upcoming VIP bookings, and active kitchen orders.
2. **Room & Session Management**: Start, extend, complete, and cancel sessions; authoritative server timers that mark expired sessions without auto-terminating paid sessions; automatic queue notification when a room opens; add/edit rooms.
3. **Booking & Queue Management**: Approve, cancel, or launch sessions directly from VIP bookings and waiting queue entries.
4. **Game & Room Mapping**: Full CRUD for games and exact multi-room checkbox mapping (`room_games`).
5. **Controller Inventory**: Approve/reject customer controller requests atomically and update per-room controller counts (`total`, `available`, `in_use`, `maintenance`).
6. **Food & Beverage Inventory**: Manage menu items, prices, active visibility, stock restocking, low-stock warnings, and view the `inventory_movements` audit trail.
7. **Order Management**: Update incoming room orders across `Pending`, `Accepted`, `Preparing`, `Ready`, `Delivered`, and `Cancelled` (with automatic stock restoration on cancellation).
8. **Transactions, Expenses & Profit Reports**: Track rental revenue + F&B revenue, record/delete operating expenses, compute net profit (`revenue - expenses`), filter by Daily/Weekly/Monthly/Custom dates, toggle Demo Seed vs Live records, and export to CSV.
9. **Customer Support Inbox**: View customer threads with unread badges, toggle Admin Online/Away status, and send replies.
10. **Ratings & Feedback Moderation**: View reviews/complaints/suggestions, post official admin replies, and unlock session reviews for customer correction (`allow_resubmit`).
11. **User Management**: View users and manage roles (`customer`/`admin`) and account status (`active`/`suspended`).
12. **Business Settings**: Configure business name, opening hours, default regular & VIP rates, allowed booking durations, low-stock threshold, low-time warning threshold, and inspect Firebase/Firestore status.

---

## 6. External API Keys & Optional Manual Setup

The application runs **100% out-of-the-box locally** without requiring external keys. To enable optional cloud integrations, configure the following in `.env`:
1. **Google Cloud Firestore & Firebase Authentication (`DB_DRIVER=firebase`)**:
   - Requires `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, and `FIREBASE_SERVICE_ACCOUNT_PATH` (see `docs/FIREBASE_SETUP.md`).
2. **External LLM Provider for AI Chatbot (`AI_API_KEY`)**:
   - Set `AI_API_KEY` (Google Gemini API key) in `.env` to augment the live-database context with generative LLM phrasing. When left blank, the chatbot runs in its clearly labeled **Live-Database FAQ & Business Intelligence Fallback Mode**.
