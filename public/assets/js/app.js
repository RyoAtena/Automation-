window.NexusApp = {
    state: {
        user: null,
        token: localStorage.getItem('nexus_token') || '',
        dbStatus: {},
        settings: {},
        roomsState: { rooms: [], queue: [], all_regular_occupied: false },
        vipConfig: { vip_rooms: [], allowed_durations_hours: [1, 2, 3, 4, 6, 8], upcoming_bookings: [] },
        catalog: { games: [], available_genres: [], available_platforms: [], rooms: [] },
        menu: { menu_items: [], low_stock_warnings: [], low_stock_threshold: 5 },
        chatbotMeta: {},
        chatbotMessages: [
            {
                sender: 'bot',
                text: 'Welcome to Nexus Arena! Ask me about available rooms, which room has a specific game (e.g., Tekken 8 or Spider-Man 2), VIP rates, controller inventory, food menu, or how the queue works.',
                time: 'Just now'
            }
        ],
        feedbackSummary: { average_rating: 5, total_reviews: 0, feedback_list: [], eligible_sessions: [] },
        notifications: [],
        cart: [],
        activePage: 'cust-home',
        qrRoomId: '',
        serverOffsetSec: 0,
        gameFilters: { search: '', genre: '', platform: '', room_id: '' }
    },

    customerNav: [
        { id: 'cust-home', label: '1. Home / Dashboard', icon: '⚡' },
        { id: 'cust-rooms', label: '2. Rooms & Live Queue', icon: '🎮' },
        { id: 'cust-vip', label: '3. VIP Suite Booking', icon: '👑' },
        { id: 'cust-games', label: '4. Game Catalog', icon: '🕹️' },
        { id: 'cust-menu', label: '5. Food & Drinks Menu', icon: '🍔' },
        { id: 'cust-session', label: '6. My Orders & Session', icon: '⏱️' },
        { id: 'cust-chatbot', label: '7. AI Concierge Bot', icon: '🤖' },
        { id: 'cust-support', label: '8. Human Admin Support', icon: '💬' },
        { id: 'cust-feedback', label: '9. Ratings & Feedback', icon: '⭐' },
        { id: 'cust-profile', label: '10. Profile & History', icon: '👤' }
    ],

    adminNav: [
        { id: 'adm-dashboard', label: '1. Admin Dashboard', icon: '📊' },
        { id: 'adm-rooms', label: '2. Rooms & Sessions', icon: '🖥️' },
        { id: 'adm-bookings', label: '3. Bookings & Queue', icon: '📅' },
        { id: 'adm-games', label: '4. Games & Room Map', icon: '🎯' },
        { id: 'adm-controllers', label: '5. Controller Inventory', icon: '🎮' },
        { id: 'adm-menu', label: '6. F&B Stock & Audit', icon: '🍟' },
        { id: 'adm-orders', label: '7. Order Management', icon: '🧾' },
        { id: 'adm-finance', label: '8. Finance & Profit CSV', icon: '💰' },
        { id: 'adm-support', label: '9. Customer Support', icon: '🎧' },
        { id: 'adm-feedback', label: '10. Ratings & Reviews', icon: '🌟' },
        { id: 'adm-users', label: '11. User Management', icon: '👥' },
        { id: 'adm-settings', label: '12. Business Settings', icon: '⚙️' }
    ],

    esc(val) {
        if (val === null || val === undefined) return '';
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    money(val) {
        const num = Math.round(Number(val || 0));
        return 'Rp ' + num.toLocaleString('id-ID');
    },

    formatDuration(sec) {
        const s = Math.max(0, Math.floor(Number(sec || 0)));
        const hrs = Math.floor(s / 3600);
        const mins = Math.floor((s % 3600) / 60);
        const secs = s % 60;
        return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
    },

    toast(message, type = 'info') {
        const container = document.getElementById('app-toast-container');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, 4200);
    },

    openModal(title, htmlContent) {
        document.getElementById('app-modal-title').textContent = title;
        document.getElementById('app-modal-body').innerHTML = htmlContent;
        document.getElementById('app-modal-backdrop').classList.add('open');
    },

    closeModal() {
        document.getElementById('app-modal-backdrop').classList.remove('open');
        document.getElementById('app-modal-body').innerHTML = '';
    },

    confirmDialog(title, message, onConfirm) {
        this.openModal(title, `
            <p style="margin-bottom:20px; color:var(--text-primary);">${this.esc(message)}</p>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button type="button" class="btn btn-secondary" onclick="NexusApp.closeModal()">Cancel</button>
                <button type="button" class="btn btn-primary" id="btn-confirm-dialog-yes">Confirm Action</button>
            </div>
        `);
        const yesBtn = document.getElementById('btn-confirm-dialog-yes');
        if (yesBtn) {
            yesBtn.onclick = async () => {
                this.closeModal();
                await onConfirm();
            };
        }
    },

    async api(action, body = null, queryParams = {}) {
        const params = new URLSearchParams({ action, ...queryParams });
        const headers = { 'Accept': 'application/json' };
        if (this.state.token) {
            headers['Authorization'] = 'Bearer ' + this.state.token;
        }
        const opts = {
            method: body !== null ? 'POST' : 'GET',
            headers
        };
        if (body !== null) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }

        const resp = await fetch('/api.php?' + params.toString(), opts);
        const json = await resp.json();
        if (!resp.ok || !json.ok) {
            throw new Error(json.error || ('Request failed with status ' + resp.status));
        }
        return json.data;
    },

    async refreshSystemState(silent = false) {
        try {
            const data = await this.api('system.init');
            this.state.user = data.user || null;
            this.state.dbStatus = data.db_status || {};
            this.state.settings = data.settings || {};
            this.state.roomsState = data.rooms_state || { rooms: [], queue: [] };
            this.state.vipConfig = data.vip_config || { vip_rooms: [], allowed_durations_hours: [1, 2, 3, 4, 6, 8] };
            this.state.catalog = data.catalog || { games: [], available_genres: [], available_platforms: [], rooms: [] };
            this.state.menu = data.menu || { menu_items: [], low_stock_warnings: [] };
            this.state.chatbotMeta = data.chatbot_meta || {};
            this.state.feedbackSummary = data.feedback_summary || { average_rating: 5, total_reviews: 0, feedback_list: [] };
            this.state.notifications = data.notifications || [];

            if (this.state.roomsState.server_timestamp) {
                const clientNow = Math.floor(Date.now() / 1000);
                this.state.serverOffsetSec = Number(this.state.roomsState.server_timestamp) - clientNow;
            }

            this.renderShell();
            if (!silent) {
                await this.renderActivePage();
            } else {
                this.tickLiveTimers();
            }
        } catch (err) {
            this.toast(err.message, 'error');
        }
    },

    renderShell() {
        const user = this.state.user;
        const isAdmin = user && user.role === 'admin';

        // Business Name & DB pill
        const bizNameEl = document.getElementById('sidebar-business-name');
        if (bizNameEl && this.state.settings.business_name) {
            bizNameEl.textContent = this.state.settings.business_name;
        }
        const roleBadgeEl = document.getElementById('sidebar-role-badge');
        if (roleBadgeEl) {
            roleBadgeEl.textContent = isAdmin ? 'ADMIN COMMAND CENTER' : 'PLAYER PORTAL & LOUNGE';
        }
        const dbText = document.getElementById('db-status-text');
        if (dbText) {
            dbText.textContent = this.state.dbStatus.label || 'Firestore Connected';
        }

        // Unread notifications badge
        const unreadNotifs = (this.state.notifications || []).filter(n => !n.is_read).length;
        const notifBadge = document.getElementById('notif-count-badge');
        if (notifBadge) {
            notifBadge.textContent = String(unreadNotifs);
        }

        // Sidebar Navigation
        const navContainer = document.getElementById('sidebar-nav-container');
        let html = '';

        if (isAdmin) {
            const expiredCount = (this.state.roomsState.rooms || []).filter(r => r.current_session && r.current_session.is_expired).length;
            const lowStockCount = (this.state.menu.low_stock_warnings || []).length;
            const queueCount = this.state.roomsState.waiting_queue_count || 0;

            html += `<div class="nav-section-label">Admin Operations (12 Modules)</div><ul class="nav-list">`;
            for (const item of this.adminNav) {
                const isActive = this.state.activePage === item.id;
                let badgeHtml = '';
                if (item.id === 'adm-rooms' && expiredCount > 0) {
                    badgeHtml = `<span class="nav-badge danger">${expiredCount} EXP</span>`;
                } else if (item.id === 'adm-bookings' && queueCount > 0) {
                    badgeHtml = `<span class="nav-badge warn">${queueCount} Q</span>`;
                } else if (item.id === 'adm-menu' && lowStockCount > 0) {
                    badgeHtml = `<span class="nav-badge warn">${lowStockCount} LOW</span>`;
                }
                html += `
                    <li class="nav-item">
                        <button type="button" class="nav-btn ${isActive ? 'active' : ''}" onclick="NexusApp.navigate('${item.id}')">
                            <span class="nav-btn-left">
                                <span class="nav-icon">${item.icon}</span>
                                <span>${this.esc(item.label)}</span>
                            </span>
                            ${badgeHtml}
                        </button>
                    </li>
                `;
            }
            html += `</ul>`;
        }

        html += `<div class="nav-section-label">Customer Portal (10 Modules)</div><ul class="nav-list">`;
        const cartCount = this.state.cart.reduce((s, i) => s + i.quantity, 0);
        for (const item of this.customerNav) {
            const isActive = this.state.activePage === item.id;
            let badgeHtml = '';
            if (item.id === 'cust-menu' && cartCount > 0) {
                badgeHtml = `<span class="nav-badge">${cartCount}</span>`;
            }
            html += `
                <li class="nav-item">
                    <button type="button" class="nav-btn ${isActive ? 'active' : ''}" onclick="NexusApp.navigate('${item.id}')">
                        <span class="nav-btn-left">
                            <span class="nav-icon">${item.icon}</span>
                            <span>${this.esc(item.label)}</span>
                        </span>
                        ${badgeHtml}
                    </button>
                </li>
            `;
        }
        html += `</ul>`;
        navContainer.innerHTML = html;

        // Sidebar Footer User Box & Topbar Auth
        const userBox = document.getElementById('sidebar-user-box');
        const topAuth = document.getElementById('topbar-auth-actions');
        if (user) {
            userBox.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <div style="min-width:0;">
                        <div style="font-weight:700; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this.esc(user.name)}</div>
                        <div style="font-size:0.74rem; color:var(--text-secondary);">${this.esc(user.email)}</div>
                    </div>
                    <span class="badge ${isAdmin ? 'badge-vip' : 'badge-available'}">${this.esc(user.role)}</span>
                </div>
            `;
            topAuth.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" onclick="NexusApp.openSwitchRoleModal()">Switch Account</button>
                <button type="button" class="btn btn-danger btn-sm" onclick="NexusApp.logout()">Logout</button>
            `;
        } else {
            userBox.innerHTML = `
                <div style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:8px;">Browsing as Guest</div>
                <button type="button" class="btn btn-primary btn-sm" style="width:100%;" onclick="NexusApp.openAuthModal('login')">Sign In / Register</button>
            `;
            topAuth.innerHTML = `
                <button type="button" class="btn btn-primary btn-sm" onclick="NexusApp.openAuthModal('login')">Sign In / Demo Login</button>
            `;
        }
    },

    async navigate(pageId) {
        this.state.activePage = pageId;
        document.getElementById('app-sidebar').classList.remove('mobile-open');
        this.renderShell();
        await this.renderActivePage();
    },

    async renderActivePage() {
        const pageId = this.state.activePage;
        const allNav = [...this.customerNav, ...this.adminNav];
        const found = allNav.find(n => n.id === pageId);
        document.getElementById('current-page-title').textContent = found ? found.label : 'Nexus Arena';

        if (pageId.startsWith('adm-')) {
            if (!this.state.user || this.state.user.role !== 'admin') {
                document.getElementById('app-main-view').innerHTML = `
                    <div class="card">
                        <h3>Administrator Access Required</h3>
                        <p style="color:var(--text-secondary); margin:10px 0 18px;">Please sign in with an Administrator account to access management, inventory, and financial modules.</p>
                        <button class="btn btn-primary" onclick="NexusApp.openAuthModal('login')">Sign In as Admin</button>
                    </div>
                `;
                return;
            }
            await window.NexusAdmin.render(pageId);
        } else {
            await window.NexusCustomer.render(pageId);
        }
        this.tickLiveTimers();
    },

    tickLiveTimers() {
        const nowServer = Math.floor(Date.now() / 1000) + this.state.serverOffsetSec;
        const warnSec = Number(this.state.settings.low_time_warning_minutes || 15) * 60;

        document.querySelectorAll('[data-timer-end]').forEach(el => {
            const endTs = Number(el.getAttribute('data-timer-end') || 0);
            const rem = endTs - nowServer;
            const box = el.closest('.timer-box');

            if (rem <= 0) {
                el.textContent = '00:00:00 (EXPIRED)';
                if (box) {
                    box.classList.remove('low-time');
                    box.classList.add('expired-time');
                }
            } else {
                el.textContent = this.formatDuration(rem);
                if (box) {
                    box.classList.remove('expired-time');
                    if (rem <= warnSec) {
                        box.classList.add('low-time');
                    } else {
                        box.classList.remove('low-time');
                    }
                }
            }
        });
    },

    openSwitchRoleModal() {
        this.openAuthModal('login');
    },

    openAuthModal(tab = 'login') {
        const isLogin = tab === 'login';
        this.openModal(isLogin ? 'Sign In to Nexus Arena' : 'Create Player Account', `
            <div style="display:flex; gap:8px; margin-bottom:16px;">
                <button type="button" class="btn ${isLogin ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex:1;" onclick="NexusApp.openAuthModal('login')">Sign In</button>
                <button type="button" class="btn ${!isLogin ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex:1;" onclick="NexusApp.openAuthModal('register')">Register</button>
            </div>

            <div style="background:#111111; border:1px solid #333333; border-radius:6px; padding:12px; margin-bottom:16px;">
                <div style="font-size:0.75rem; font-weight:600; color:#d4d4d4; margin-bottom:8px; text-transform:uppercase;">1-Click Quick Demo Accounts:</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="NexusApp.quickLogin('alex@gamer.gg', 'Customer@123')">Customer: Alex Mercer</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="NexusApp.quickLogin('maya@gamer.gg', 'Customer@123')">Customer: Maya Lin</button>
                    <button type="button" class="btn btn-primary btn-sm" onclick="NexusApp.quickLogin('admin@nexusarena.gg', 'Admin@123')">Admin: Admin Utama</button>
                </div>
            </div>

            ${isLogin ? `
                <form id="form-auth-login" onsubmit="NexusApp.submitLogin(event)">
                    <div class="form-group">
                        <label class="form-label">Email Address</label>
                        <input type="email" name="email" class="form-control" required placeholder="alex@gamer.gg">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Password</label>
                        <input type="password" name="password" class="form-control" required placeholder="••••••••">
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%;">Sign In</button>
                </form>
            ` : `
                <form id="form-auth-register" onsubmit="NexusApp.submitRegister(event)">
                    <div class="form-group">
                        <label class="form-label">Full Name</label>
                        <input type="text" name="name" class="form-control" required placeholder="Jordan Avery">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email Address</label>
                        <input type="email" name="email" class="form-control" required placeholder="jordan@gamer.gg">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Phone Number</label>
                        <input type="text" name="phone" class="form-control" placeholder="+1-555-0199">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Password (min 6 chars)</label>
                        <input type="password" name="password" class="form-control" required minlength="6">
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%;">Create Account</button>
                </form>
            `}
        `);
    },

    async quickLogin(email, password) {
        try {
            const res = await this.api('auth.login', { email, password });
            this.state.token = res.token || '';
            localStorage.setItem('nexus_token', this.state.token);
            this.state.user = res.user;
            this.closeModal();
            this.toast('Signed in as ' + res.user.name + ' (' + res.user.role.toUpperCase() + ')', 'success');
            if (res.user.role === 'admin') {
                this.state.activePage = 'adm-dashboard';
            } else {
                this.state.activePage = 'cust-home';
            }
            await this.refreshSystemState();
        } catch (err) {
            this.toast(err.message, 'error');
        }
    },

    async submitLogin(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        await this.quickLogin(fd.get('email'), fd.get('password'));
    },

    async submitRegister(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            const res = await this.api('auth.register', {
                name: fd.get('name'),
                email: fd.get('email'),
                phone: fd.get('phone'),
                password: fd.get('password')
            });
            this.state.token = res.token || '';
            localStorage.setItem('nexus_token', this.state.token);
            this.state.user = res.user;
            this.closeModal();
            this.toast('Account created! Welcome, ' + res.user.name, 'success');
            this.state.activePage = 'cust-home';
            await this.refreshSystemState();
        } catch (err) {
            this.toast(err.message, 'error');
        }
    },

    async logout() {
        try {
            await this.api('auth.logout', {});
        } catch (_) {}
        this.state.token = '';
        localStorage.removeItem('nexus_token');
        this.state.user = null;
        this.state.activePage = 'cust-home';
        this.toast('Signed out successfully.', 'info');
        await this.refreshSystemState();
    },

    openNotificationsModal() {
        const list = this.state.notifications || [];
        let html = '';
        if (list.length === 0) {
            html = `<div class="empty-state">No notifications yet.</div>`;
        } else {
            html = `<div style="display:flex; flex-direction:column; gap:10px;">` + list.map(n => `
                <div class="card" style="padding:12px; border-color:${n.is_read ? 'var(--border-subtle)' : 'var(--neon-blue)'};">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="font-size:0.9rem;">${this.esc(n.title)}</strong>
                        <span class="badge badge-${this.esc(n.type || 'info')}">${n.is_read ? 'Read' : 'New'}</span>
                    </div>
                    <p style="font-size:0.84rem; color:var(--text-secondary);">${this.esc(n.message)}</p>
                </div>
            `).join('') + `</div>`;
        }
        this.openModal('System Notifications & Alerts', html);
    },

    openQrScannerSimulatorModal() {
        const rooms = (this.state.roomsState && this.state.roomsState.rooms) || [];
        this.openModal('QR Code Meja / Ruangan — NexusFlow Ordering', `
            <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:14px;">
                Setiap ruangan/meja memiliki QR Code unik. Ketika pelanggan memindai QR Code di meja, aplikasi otomatis mendeteksi nomor ruangan dan membuka menu pemesanan.
            </p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                ${rooms.map(r => {
                    const qrUrl = window.location.origin + '/?room=' + encodeURIComponent(r.id);
                    const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(qrUrl);
                    return `
                        <div class="card" style="padding:12px; text-align:center;">
                            <div style="font-weight:700; font-size:0.86rem; margin-bottom:6px;">${this.esc(r.name)}</div>
                            <div class="qr-frame" style="padding:8px; margin:4px auto 8px;">
                                <img src="${this.esc(qrImg)}" alt="QR ${this.esc(r.name)}" width="110" height="110" style="display:block;">
                            </div>
                            <button type="button" class="btn btn-primary btn-sm" style="width:100%;" onclick="NexusApp.activateQrRoom('${this.esc(r.id)}')">
                                Simulasi Scan QR Ini
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `);
    },

    activateQrRoom(roomId) {
        this.state.qrRoomId = roomId;
        this.closeModal();
        const rooms = (this.state.roomsState && this.state.roomsState.rooms) || [];
        const room = rooms.find(r => r.id === roomId);
        this.toast('Terhubung melalui QR Meja/Ruangan: ' + (room ? room.name : roomId), 'success');
        this.navigate('cust-menu');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        NexusApp.state.qrRoomId = roomParam;
        NexusApp.state.activePage = 'cust-menu';
    }
    document.getElementById('btn-close-modal').addEventListener('click', () => NexusApp.closeModal());
    document.getElementById('app-modal-backdrop').addEventListener('click', (e) => {
        if (e.target.id === 'app-modal-backdrop') NexusApp.closeModal();
    });
    document.getElementById('btn-mobile-menu').addEventListener('click', () => {
        document.getElementById('app-sidebar').classList.toggle('mobile-open');
    });
    document.getElementById('btn-refresh-state').addEventListener('click', () => {
        NexusApp.refreshSystemState(false);
        NexusApp.toast('Synchronized with server database.', 'success');
    });
    document.getElementById('btn-notifications').addEventListener('click', () => {
        NexusApp.openNotificationsModal();
    });

    NexusApp.refreshSystemState(false);

    // 1-second authoritative countdown ticker
    setInterval(() => NexusApp.tickLiveTimers(), 1000);

    // 15-second background server state synchronization
    setInterval(() => NexusApp.refreshSystemState(true), 15000);
});
