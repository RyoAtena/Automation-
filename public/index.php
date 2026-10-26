<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/src/bootstrap.php';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEXUS ARENA — Game Center Management &amp; Console Rental System</title>
    <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
    <div class="app-layout">
        <!-- Sidebar Navigation -->
        <aside class="sidebar" id="app-sidebar">
            <div class="brand-header">
                <div class="brand-logo">NX</div>
                <div>
                    <div class="brand-title" id="sidebar-business-name">NEXUS ARENA</div>
                    <div class="brand-subtitle" id="sidebar-role-badge">Console Lounge &amp; VIP</div>
                </div>
            </div>

            <div id="sidebar-nav-container" style="flex:1; overflow-y:auto;"></div>

            <div class="sidebar-footer" id="sidebar-user-box"></div>
        </aside>

        <!-- Main Workspace -->
        <div class="main-wrapper">
            <header class="topbar">
                <div class="topbar-left">
                    <button class="mobile-menu-btn" id="btn-mobile-menu" type="button" aria-label="Toggle Menu">&#9776;</button>
                    <div>
                        <h1 class="page-heading" id="current-page-title">Loading Nexus Arena...</h1>
                    </div>
                </div>
                <div class="topbar-right">
                    <div class="db-pill" id="db-status-pill" title="Database &amp; Persistence Status">
                        <span class="pulse-dot"></span>
                        <span id="db-status-text">Firestore Engine</span>
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-refresh-state" type="button" title="Sync Live Data">
                        &#8635; Sync Live
                    </button>
                    <button class="btn btn-secondary btn-sm" id="btn-notifications" type="button">
                        &#128276; <span id="notif-count-badge">0</span>
                    </button>
                    <div id="topbar-auth-actions"></div>
                </div>
            </header>

            <main class="content-container" id="app-main-view">
                <div class="card">
                    <p style="color:var(--text-secondary);">Initializing Nexus Arena console systems...</p>
                </div>
            </main>
        </div>
    </div>

    <!-- Reusable Modal Dialog -->
    <div class="modal-backdrop" id="app-modal-backdrop" role="dialog" aria-modal="true">
        <div class="modal-panel" id="app-modal-panel">
            <div class="modal-header">
                <h3 id="app-modal-title">Modal Title</h3>
                <button class="btn btn-secondary btn-sm" id="btn-close-modal" type="button">&#10005;</button>
            </div>
            <div id="app-modal-body"></div>
        </div>
    </div>

    <!-- Toast Notifications -->
    <div class="toast-container" id="app-toast-container"></div>

    <script src="/assets/js/app.js"></script>
    <script src="/assets/js/customer.js"></script>
    <script src="/assets/js/admin.js"></script>
</body>
</html>
