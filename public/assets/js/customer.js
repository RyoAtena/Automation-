window.NexusCustomer = {
    async render(pageId) {
        const container = document.getElementById('app-main-view');
        switch (pageId) {
            case 'cust-home':
                return this.renderHome(container);
            case 'cust-rooms':
                return this.renderRoomsAndQueue(container);
            case 'cust-vip':
                return this.renderVipBooking(container);
            case 'cust-games':
                return this.renderGameCatalog(container);
            case 'cust-menu':
                return this.renderFoodMenu(container);
            case 'cust-session':
                return this.renderMySessionAndOrders(container);
            case 'cust-chatbot':
                return this.renderAiChatbot(container);
            case 'cust-support':
                return this.renderHumanSupport(container);
            case 'cust-feedback':
                return this.renderFeedback(container);
            case 'cust-profile':
                return this.renderProfile(container);
            default:
                return this.renderHome(container);
        }
    },

    renderRoomCardHtml(room) {
        const sess = room.current_session;
        const gamesList = (room.available_games || []).map(g => `<span class="chip">${NexusApp.esc(g.title)}</span>`).join('');
        const consolesList = (room.consoles || []).join(' • ');
        const isVip = room.type === 'vip';

        let timerHtml = '';
        if (sess && room.status === 'occupied') {
            const boxClass = sess.is_expired ? 'expired-time' : (sess.is_low_time ? 'low-time' : '');
            timerHtml = `
                <div class="timer-box ${boxClass}">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-secondary); margin-bottom:4px;">
                        <span>SESSION REMAINING</span>
                        <span class="badge badge-${sess.is_expired ? 'danger' : 'occupied'}">${NexusApp.esc(sess.status)}</span>
                    </div>
                    <div class="timer-digits" data-timer-end="${sess.end_timestamp}">${NexusApp.formatDuration(sess.remaining_seconds)}</div>
                    <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:6px;">
                        <div>Playing: <strong style="color:var(--text-primary);">${NexusApp.esc(sess.game_title)}</strong></div>
                        <div>Started: ${NexusApp.esc(String(sess.start_time).slice(11, 16))} • Ends: ${NexusApp.esc(String(sess.scheduled_end_time).slice(11, 16))}</div>
                        ${sess.is_own_session ? `<div style="color:var(--neon-blue); font-weight:700; margin-top:4px;">★ This is your active room session</div>` : ''}
                    </div>
                </div>
            `;
        }

        return `
            <div class="card room-card ${isVip ? 'vip-border' : ''}">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;">
                        <div>
                            <span class="badge ${isVip ? 'badge-vip' : 'badge-info'}" style="margin-bottom:6px;">${isVip ? '👑 VIP SUITE' : '🎮 REGULAR POD'}</span>
                            <h3 style="font-size:1.08rem;">${NexusApp.esc(room.name)}</h3>
                        </div>
                        <span class="badge badge-${NexusApp.esc(room.status)}">${NexusApp.esc(room.status)}</span>
                    </div>

                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:12px;">${NexusApp.esc(room.description || '')}</p>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:#0f0f0f; border:1px solid #262626; padding:10px; border-radius:6px; font-size:0.8rem; margin-bottom:12px;">
                        <div>
                            <div style="color:var(--text-secondary);">Tarif / Jam</div>
                            <strong style="color:#ffffff; font-size:0.96rem;">${NexusApp.money(room.rate_per_hour)}/jam</strong>
                        </div>
                        <div>
                            <div style="color:var(--text-secondary);">Controllers</div>
                            <strong>${room.available_controllers} / ${room.total_controllers} Avail</strong>
                        </div>
                        <div style="grid-column:span 2;">
                            <div style="color:var(--text-secondary);">Consoles</div>
                            <strong>${NexusApp.esc(consolesList)} (Up to ${room.max_players}P)</strong>
                        </div>
                    </div>

                    <div style="margin-bottom:10px;">
                        <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Installed Games (${(room.available_games || []).length}):</div>
                        <div class="chip-list">${gamesList || '<span class="chip">Standard Console Library</span>'}</div>
                    </div>

                    ${timerHtml}
                </div>

                <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border-subtle); display:flex; gap:8px; justify-content:space-between;">
                    ${isVip ? `
                        <button type="button" class="btn btn-primary btn-sm" style="flex:1;" onclick="NexusApp.navigate('cust-vip')">👑 Book VIP Suite</button>
                    ` : `
                        <button type="button" class="btn btn-secondary btn-sm" style="flex:1;" onclick="NexusApp.navigate('cust-rooms')">View Status / Queue</button>
                    `}
                    <button type="button" class="btn btn-secondary btn-sm" onclick="NexusCustomer.filterGamesByRoom('${NexusApp.esc(room.id)}')">🕹️ Room Games</button>
                </div>
            </div>
        `;
    },

    filterGamesByRoom(roomId) {
        NexusApp.state.gameFilters.room_id = roomId;
        NexusApp.navigate('cust-games');
    },

    renderWorkflowDiagramHtml() {
        const isAdmin = NexusApp.state.user && NexusApp.state.user.role === 'admin';
        return `
            <div class="card" style="margin-bottom:24px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:18px;">
                    <div>
                        <span class="badge badge-info" style="margin-bottom:6px;">INTEGRATED WORKFLOW</span>
                        <h3 style="font-size:1.18rem;">Alur Pemesanan QR Meja, Pembayaran &amp; Dashboard Dapur/Barista</h3>
                        <p style="font-size:0.82rem; color:var(--text-secondary);">Klik pada setiap tahapan di bawah ini untuk menjalankan atau menguji fiturnya secara langsung.</p>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" onclick="NexusApp.openQrScannerSimulatorModal()">
                        📱 Scan / Pilih QR Meja &amp; Ruangan
                    </button>
                </div>

                <div class="workflow-stack">
                    <div class="workflow-step" onclick="NexusApp.openQrScannerSimulatorModal()">
                        <div class="workflow-step-icon">📱</div>
                        <div class="workflow-step-title">Pelanggan membuka NexusFlow</div>
                        <div class="workflow-step-sub">Melalui aplikasi web atau scan QR code di meja / ruangan gaming</div>
                    </div>
                    <div class="workflow-arrow">&darr;</div>

                    <div class="workflow-step" onclick="NexusApp.navigate('cust-menu')">
                        <div class="workflow-step-title">Memilih menu dan membuat pesanan</div>
                        <div class="workflow-step-sub">Menu, harga Rupiah, dan ketersediaan stok ditampilkan otomatis secara real-time</div>
                    </div>
                    <div class="workflow-arrow">&darr;</div>

                    <div class="workflow-step" onclick="NexusApp.navigate('cust-menu')">
                        <div class="workflow-step-title">Sistem menghitung total pembayaran</div>
                        <div class="workflow-step-sub">Total harga dan ringkasan pesanan dibuat otomatis di keranjang</div>
                    </div>
                    <div class="workflow-arrow">&darr;</div>

                    <div class="workflow-step" onclick="NexusApp.navigate('cust-menu')">
                        <div class="workflow-step-title">Pelanggan melakukan pembayaran</div>
                        <div class="workflow-step-sub">Kasir atau metode pembayaran digital yang didukung (QRIS, E-Wallet, Kartu, Room Tab)</div>
                    </div>
                    <div class="workflow-arrow">&darr;</div>

                    <div class="workflow-step" onclick="${isAdmin ? "NexusApp.navigate('adm-orders')" : "NexusApp.navigate('cust-session')"}">
                        <div class="workflow-step-title">Pesanan otomatis masuk ke dashboard dapur/barista</div>
                        <div class="workflow-step-sub">Dapur/barista menerima tiket pesanan real-time lengkap dengan nomor ruangan/meja</div>
                    </div>
                    <div class="workflow-arrow">&darr;</div>

                    <div class="workflow-step" onclick="${isAdmin ? "NexusApp.navigate('adm-menu')" : "NexusApp.navigate('cust-menu')"}">
                        <div class="workflow-step-icon">&#8635;</div>
                        <div class="workflow-step-title">Stok dan laporan penjualan diperbarui</div>
                        <div class="workflow-step-sub">Sistem memperbarui data transaksi, memotong stok otomatis, dan menghitung penjualan harian</div>
                    </div>
                    <div class="workflow-arrow">&darr;</div>

                    <div class="workflow-step" onclick="${isAdmin ? "NexusApp.navigate('adm-finance')" : "NexusApp.openAuthModal('login')"}">
                        <div class="workflow-step-icon">📊</div>
                        <div class="workflow-step-title">Pemilik memantau performa kafe &amp; rental</div>
                        <div class="workflow-step-sub">Omzet harian, menu terlaris, dan daftar stok yang perlu diisi ulang</div>
                    </div>
                </div>
            </div>
        `;
    },

    // =========================================================================
    // 1. HOME / DASHBOARD
    // =========================================================================
    renderHome(container) {
        const rs = NexusApp.state.roomsState;
        const rooms = rs.rooms || [];
        const availCount = rooms.filter(r => r.status === 'available').length;
        const occupiedCount = rooms.filter(r => r.status === 'occupied').length;
        const vipRooms = rooms.filter(r => r.type === 'vip');
        const fb = NexusApp.state.feedbackSummary || {};
        const user = NexusApp.state.user;

        const ownActiveRoom = rooms.find(r => r.current_session && r.current_session.is_own_session);

        container.innerHTML = `
            <div class="card card-neon" style="margin-bottom:24px; background:#121212;">
                <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:20px;">
                    <div style="max-width:680px;">
                        <span class="badge badge-vip" style="margin-bottom:10px;">CONSOLE LOUNGE &amp; VIP RENTAL</span>
                        <h2 style="font-size:1.75rem; font-weight:700; margin-bottom:8px;">${NexusApp.esc(NexusApp.state.settings.business_name || 'Nexus Arena Gaming & Rental')}</h2>
                        <p style="color:var(--text-secondary); font-size:0.92rem; margin-bottom:18px;">
                            Rental konsol PlayStation 5, Xbox Series X, dan Nintendo Switch OLED dengan ruang Reguler (${NexusApp.money(NexusApp.state.settings.regular_default_rate || 20000)}/jam) serta VIP Suite (${NexusApp.money(NexusApp.state.settings.vip_default_rate || 50000)}/jam).
                            Jam Operasional: <strong>${NexusApp.esc(NexusApp.state.settings.opening_hours || '10:00 - 02:00 WIB (Setiap Hari)')}</strong>.
                        </p>
                        <div style="display:flex; flex-wrap:wrap; gap:10px;">
                            <button class="btn btn-primary" onclick="NexusApp.navigate('cust-vip')">Book VIP Room</button>
                            <button class="btn btn-secondary" onclick="NexusApp.navigate('cust-rooms')">Rooms &amp; Live Queue</button>
                            <button class="btn btn-secondary" onclick="NexusApp.navigate('cust-menu')">Order Food &amp; Drinks</button>
                            <button class="btn btn-secondary" onclick="NexusApp.navigate('cust-chatbot')">Ask AI Concierge</button>
                        </div>
                    </div>
                    <div style="background:#0d0d0d; padding:18px 22px; border-radius:8px; border:1px solid #262626; min-width:240px;">
                        <div style="font-size:0.74rem; color:var(--text-secondary); text-transform:uppercase; font-weight:600;">Player Session Status</div>
                        ${user ? `
                            <div style="font-size:1.02rem; font-weight:700; margin-top:4px;">Welcome, ${NexusApp.esc(user.name)}</div>
                            <div style="font-size:0.78rem; color:#d4d4d4; margin-bottom:10px;">Role: ${NexusApp.esc(user.role.toUpperCase())}</div>
                            <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="NexusApp.navigate('cust-session')">View My Active Session</button>
                        ` : `
                            <div style="font-size:0.88rem; margin:6px 0 12px; color:var(--text-secondary);">Sign in to book VIP suites, join queues, or order F&amp;B to your room.</div>
                            <button class="btn btn-primary btn-sm" style="width:100%;" onclick="NexusApp.openAuthModal('login')">Sign In / Demo Switch</button>
                        `}
                    </div>
                </div>
            </div>

            ${ownActiveRoom ? `
                <div class="alert-banner info">
                    <div>
                        <strong>You have an active gaming session in ${NexusApp.esc(ownActiveRoom.name)}!</strong>
                        <span style="margin-left:10px;">Remaining Time: <strong data-timer-end="${ownActiveRoom.current_session.end_timestamp}">${NexusApp.formatDuration(ownActiveRoom.current_session.remaining_seconds)}</strong></span>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="NexusApp.navigate('cust-session')">Manage My Session &amp; Controllers</button>
                        <button class="btn btn-secondary btn-sm" onclick="NexusApp.navigate('cust-menu')">Order Food to Room</button>
                    </div>
                </div>
            ` : ''}

            <div class="grid-4">
                <div class="card stat-card">
                    <span class="stat-label">Available Rooms</span>
                    <div class="stat-value">${availCount} <span style="font-size:1rem; color:var(--text-secondary);">/ ${rooms.length}</span></div>
                    <span class="stat-sub">${occupiedCount} Currently Occupied</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Regular Queue</span>
                    <div class="stat-value">${rs.waiting_queue_count || 0}</div>
                    <span class="stat-sub">Tarif Reguler: ${NexusApp.money(NexusApp.state.settings.regular_default_rate || 20000)}/jam</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">VIP Suites</span>
                    <div class="stat-value">${vipRooms.length}</div>
                    <span class="stat-sub">Tarif VIP: ${NexusApp.money(NexusApp.state.settings.vip_default_rate || 50000)}/jam</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Community Rating</span>
                    <div class="stat-value">${fb.total_reviews > 0 ? '★ ' + Number(fb.average_rating).toFixed(1) : '—'}</div>
                    <span class="stat-sub">${fb.total_reviews || 0} verified reviews</span>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h3 style="font-size:1.15rem;">Live Gaming Rooms Overview</h3>
                <button class="btn btn-secondary btn-sm" onclick="NexusApp.navigate('cust-rooms')">View Full Queue &amp; Details &rarr;</button>
            </div>
            <div class="grid-3">
                ${rooms.map(r => this.renderRoomCardHtml(r)).join('')}
            </div>

            ${this.renderWorkflowDiagramHtml()}
        `;
    },

    // =========================================================================
    // 2. ROOM AVAILABILITY & QUEUE SYSTEM
    // =========================================================================
    renderRoomsAndQueue(container) {
        const rs = NexusApp.state.roomsState;
        const rooms = rs.rooms || [];
        const queue = rs.queue || [];
        const allRegOccupied = Boolean(rs.all_regular_occupied);

        container.innerHTML = `
            ${allRegOccupied ? `
                <div class="alert-banner warning">
                    <div>
                        <strong>⚠️ All Regular Gaming Rooms Are Currently Occupied!</strong>
                        <p style="font-size:0.84rem; margin-top:2px;">No regular rooms are immediately available. Currently waiting in queue: <strong>${queue.length} customer(s)</strong>. Join the queue below and we will automatically notify you as soon as the next room opens!</p>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('queue-join-card').scrollIntoView({behavior:'smooth'})">Join Queue Now</button>
                </div>
            ` : `
                <div class="alert-banner info">
                    <div>
                        <strong>✅ ${rs.regular_available || 0} Regular Room(s) Available Right Now!</strong>
                        <span style="margin-left:8px; font-size:0.85rem;">You can also join the standby queue or reserve a VIP suite in advance.</span>
                    </div>
                    <span class="badge badge-available">${queue.length} in Queue</span>
                </div>
            `}

            <div class="grid-3">
                ${rooms.map(r => this.renderRoomCardHtml(r)).join('')}
            </div>

            <div class="grid-2" id="queue-join-card">
                <div class="card">
                    <h3 style="margin-bottom:8px;">📋 Live Waiting Queue (${queue.length} Waiting)</h3>
                    <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:14px;">Rooms are assigned strictly in queue order as sessions complete.</p>
                    ${queue.length === 0 ? `<div class="empty-state">No customers waiting in the queue right now.</div>` : `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Pos</th>
                                        <th>Player</th>
                                        <th>Console / Type</th>
                                        <th>Party</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${queue.map(q => {
                                        const isMine = NexusApp.state.user && q.user_id === NexusApp.state.user.id;
                                        return `
                                            <tr>
                                                <td><strong>#${q.position}</strong></td>
                                                <td>${NexusApp.esc(q.customer_name)} ${isMine ? '<span class="badge badge-info">You</span>' : ''}</td>
                                                <td>${NexusApp.esc(q.preferred_console)} (${NexusApp.esc(q.preferred_room_type)})</td>
                                                <td>${q.party_size}P • ${q.requested_hours}h</td>
                                                <td>
                                                    <span class="badge badge-${NexusApp.esc(q.status)}">${NexusApp.esc(q.status)}</span>
                                                    ${q.notified_room_name ? `<div style="font-size:0.74rem; color:#34d399; margin-top:3px;">Ready: ${NexusApp.esc(q.notified_room_name)}</div>` : ''}
                                                </td>
                                                <td>
                                                    ${isMine ? `<button class="btn btn-danger btn-sm" onclick="NexusCustomer.cancelQueue('${NexusApp.esc(q.id)}')">Leave</button>` : '—'}
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>

                <div class="card">
                    <h3 style="margin-bottom:8px;">🚶 Join the Room Queue</h3>
                    <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:14px;">Get notified automatically when a matching console station finishes its current session.</p>
                    <form onsubmit="NexusCustomer.submitJoinQueue(event)">
                        <div class="form-group">
                            <label class="form-label">Preferred Room Type</label>
                            <select name="preferred_room_type" class="form-control">
                                <option value="regular">Regular Gaming Pod (Rp 20.000/jam)</option>
                                <option value="vip">VIP Suite (Rp 50.000/jam)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Preferred Console</label>
                            <select name="preferred_console" class="form-control">
                                <option value="PlayStation 5">PlayStation 5</option>
                                <option value="Xbox Series X">Xbox Series X</option>
                                <option value="Nintendo Switch OLED">Nintendo Switch OLED</option>
                                <option value="Any Console">Any Available Console</option>
                            </select>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label class="form-label">Party Size (Players)</label>
                                <input type="number" name="party_size" class="form-control" value="2" min="1" max="8" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Planned Duration (Hours)</label>
                                <input type="number" name="requested_hours" class="form-control" value="2" min="1" max="8" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notes / Game Request (Optional)</label>
                            <input type="text" name="notes" class="form-control" placeholder="e.g., Looking for FC 26 or Tekken 8">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%;">Join Waiting Queue</button>
                    </form>
                </div>
            </div>
        `;
    },

    async submitJoinQueue(e) {
        e.preventDefault();
        if (!NexusApp.state.user) {
            NexusApp.openAuthModal('login');
            return;
        }
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('queue.join', {
                preferred_room_type: fd.get('preferred_room_type'),
                preferred_console: fd.get('preferred_console'),
                party_size: Number(fd.get('party_size')),
                requested_hours: Number(fd.get('requested_hours')),
                notes: fd.get('notes')
            });
            NexusApp.toast('Joined the waiting queue! We will notify you when a room is ready.', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    async cancelQueue(queueId) {
        NexusApp.confirmDialog('Leave Waiting Queue', 'Are you sure you want to remove yourself from the waiting queue?', async () => {
            try {
                await NexusApp.api('queue.cancel', { queue_id: queueId });
                NexusApp.toast('Removed from queue.', 'info');
                await NexusApp.refreshSystemState(false);
            } catch (err) {
                NexusApp.toast(err.message, 'error');
            }
        });
    },

    // =========================================================================
    // 3. VIP ROOM BOOKING
    // =========================================================================
    async renderVipBooking(container) {
        const vipCfg = NexusApp.state.vipConfig || {};
        const vipRooms = vipCfg.vip_rooms || [];
        const durations = vipCfg.allowed_durations_hours || [1, 2, 3, 4, 6, 8];
        const today = new Date().toISOString().slice(0, 10);

        let myBookings = [];
        if (NexusApp.state.user) {
            try {
                const res = await NexusApp.api('bookings.list');
                myBookings = res.bookings || [];
            } catch (_) {}
        }

        container.innerHTML = `
            <div class="grid-2">
                ${vipRooms.map(v => `
                    <div class="card vip-border">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                            <div>
                                <span class="badge badge-vip">EXECUTIVE VIP SUITE</span>
                                <h3 style="font-size:1.2rem; margin-top:6px;">${NexusApp.esc(v.name)}</h3>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:1.25rem; font-weight:700; color:#ffffff;">${NexusApp.money(v.rate_per_hour)}<span style="font-size:0.78rem; color:var(--text-secondary);">/jam</span></div>
                                <span class="badge badge-${NexusApp.esc(v.status)}">${NexusApp.esc(v.status)}</span>
                            </div>
                        </div>
                        <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:12px;">${NexusApp.esc(v.description || '')}</p>
                        <div style="font-size:0.82rem; margin-bottom:10px;">
                            <strong>Consoles:</strong> ${NexusApp.esc((v.consoles || []).join(' + '))} • <strong>Max Capacity:</strong> Up to ${v.max_players} Players
                        </div>
                        <div>
                            <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:6px;">Suite Facilities &amp; Perks:</div>
                            <div class="chip-list">
                                ${(v.facilities || []).map(f => `<span class="chip">${NexusApp.esc(f)}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="grid-2">
                <div class="card card-neon">
                    <h3 style="margin-bottom:8px;">Reserve a VIP Suite</h3>
                    <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:16px;">Select your suite, date, start time, and duration. Overlapping bookings are automatically prevented.</p>
                    <form id="form-vip-booking" onsubmit="NexusCustomer.submitVipBooking(event)">
                        <div class="form-group">
                            <label class="form-label">Select VIP Suite</label>
                            <select name="room_id" id="vip-room-select" class="form-control" required onchange="NexusCustomer.recalcVipPrice()">
                                ${vipRooms.map(v => `<option value="${NexusApp.esc(v.id)}" data-rate="${v.rate_per_hour}" data-max="${v.max_players}">${NexusApp.esc(v.name)} (${NexusApp.money(v.rate_per_hour)}/jam — Max ${v.max_players}P)</option>`).join('')}
                            </select>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label class="form-label">Booking Date</label>
                                <input type="date" name="booking_date" class="form-control" value="${today}" min="${today}" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Start Time (24h)</label>
                                <input type="time" name="start_time" class="form-control" value="18:00" required>
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label class="form-label">Rental Duration (Configurable)</label>
                                <select name="duration_hours" id="vip-duration-select" class="form-control" required onchange="NexusCustomer.recalcVipPrice()">
                                    ${durations.map(d => `<option value="${d}" ${d === 2 ? 'selected' : ''}>${d} Jam</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Number of Guests</label>
                                <input type="number" name="guests_count" class="form-control" value="4" min="1" max="8" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Special Requests / Tournament Setup Notes</label>
                            <input type="text" name="notes" class="form-control" placeholder="e.g., Tekken 8 & FC 26 pre-loaded, 4 DualSense controllers">
                        </div>

                        <div style="background:#111111; border:1px solid #333333; padding:14px; border-radius:8px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <div style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:700;">Estimated Total Price</div>
                                <div style="font-size:0.8rem; color:var(--text-secondary);" id="vip-price-breakdown">Calculated automatically from suite rate &times; duration</div>
                            </div>
                            <div style="font-size:1.45rem; font-weight:700; color:#ffffff;" id="vip-total-display">Rp 100.000</div>
                        </div>

                        <button type="submit" class="btn btn-primary" style="width:100%;">Confirm VIP Booking Request</button>
                    </form>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:8px;">📜 My VIP Bookings &amp; Schedule</h3>
                    <p style="font-size:0.84rem; color:var(--text-secondary); margin-bottom:14px;">Track confirmation status for your reserved VIP suites.</p>
                    ${!NexusApp.state.user ? `
                        <div class="empty-state">
                            <p style="margin-bottom:10px;">Sign in to view and manage your VIP bookings.</p>
                            <button class="btn btn-primary btn-sm" onclick="NexusApp.openAuthModal('login')">Sign In</button>
                        </div>
                    ` : (myBookings.length === 0 ? `<div class="empty-state">You have no VIP bookings yet.</div>` : `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Suite</th>
                                        <th>Date &amp; Time</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${myBookings.map(b => `
                                        <tr>
                                            <td>
                                                <strong>${NexusApp.esc(b.room_name)}</strong>
                                                <div style="font-size:0.75rem; color:var(--text-secondary);">${b.guests_count} Guests • ${b.duration_hours}h</div>
                                            </td>
                                            <td>
                                                <div>${NexusApp.esc(b.booking_date)}</div>
                                                <div style="font-size:0.76rem; color:var(--neon-blue);">${NexusApp.esc(b.start_time)} - ${NexusApp.esc(b.end_time)}</div>
                                            </td>
                                            <td><strong>${NexusApp.money(b.total_price)}</strong></td>
                                            <td><span class="badge badge-${NexusApp.esc(b.status)}">${NexusApp.esc(b.status)}</span></td>
                                            <td>
                                                ${b.status === 'pending' ? `<button class="btn btn-danger btn-sm" onclick="NexusCustomer.cancelMyBooking('${NexusApp.esc(b.id)}')">Cancel</button>` : '—'}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `)}
                </div>
            </div>
        `;
        this.recalcVipPrice();
    },

    recalcVipPrice() {
        const roomSel = document.getElementById('vip-room-select');
        const durSel = document.getElementById('vip-duration-select');
        const totalEl = document.getElementById('vip-total-display');
        const breakEl = document.getElementById('vip-price-breakdown');
        if (!roomSel || !durSel || !totalEl) return;

        const opt = roomSel.options[roomSel.selectedIndex];
        const rate = Number(opt ? opt.getAttribute('data-rate') : 50000);
        const hrs = Number(durSel.value || 1);
        const total = rate * hrs;
        totalEl.textContent = NexusApp.money(total);
        if (breakEl) {
            breakEl.textContent = `${NexusApp.money(rate)}/jam × ${hrs} jam`;
        }
    },

    async submitVipBooking(e) {
        e.preventDefault();
        if (!NexusApp.state.user) {
            NexusApp.openAuthModal('login');
            return;
        }
        const fd = new FormData(e.target);
        try {
            const res = await NexusApp.api('bookings.create', {
                room_id: fd.get('room_id'),
                booking_date: fd.get('booking_date'),
                start_time: fd.get('start_time'),
                duration_hours: Number(fd.get('duration_hours')),
                guests_count: Number(fd.get('guests_count')),
                notes: fd.get('notes')
            });
            NexusApp.toast('VIP Booking submitted! ID: ' + res.booking.id + ' (' + NexusApp.money(res.booking.total_price) + ')', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    async cancelMyBooking(bookingId) {
        NexusApp.confirmDialog('Cancel VIP Booking', 'Are you sure you want to cancel this pending VIP booking?', async () => {
            try {
                await NexusApp.api('bookings.status', { booking_id: bookingId, status: 'cancelled' });
                NexusApp.toast('Booking cancelled.', 'info');
                await NexusApp.refreshSystemState(false);
            } catch (err) {
                NexusApp.toast(err.message, 'error');
            }
        });
    },

    // =========================================================================
    // 4. GAME CATALOG & ROOM MAPPING
    // =========================================================================
    async renderGameCatalog(container) {
        const gf = NexusApp.state.gameFilters;
        const catalogData = await NexusApp.api('games.list', null, gf);
        const games = catalogData.games || [];
        const genres = catalogData.available_genres || [];
        const platforms = catalogData.available_platforms || [];
        const rooms = catalogData.rooms || [];

        container.innerHTML = `
            <div class="filter-bar">
                <input type="text" id="game-filter-search" class="form-control" placeholder="🔍 Search games by title, genre, or description..." value="${NexusApp.esc(gf.search)}">
                <select id="game-filter-genre" class="form-control">
                    <option value="">All Genres</option>
                    ${genres.map(g => `<option value="${NexusApp.esc(g)}" ${gf.genre.toLowerCase() === g.toLowerCase() ? 'selected' : ''}>${NexusApp.esc(g)}</option>`).join('')}
                </select>
                <select id="game-filter-platform" class="form-control">
                    <option value="">All Platforms / Consoles</option>
                    ${platforms.map(p => `<option value="${NexusApp.esc(p)}" ${gf.platform.toLowerCase() === p.toLowerCase() ? 'selected' : ''}>${NexusApp.esc(p)}</option>`).join('')}
                </select>
                <select id="game-filter-room" class="form-control">
                    <option value="">All Gaming Rooms</option>
                    ${rooms.map(r => `<option value="${NexusApp.esc(r.id)}" ${gf.room_id === r.id ? 'selected' : ''}>${NexusApp.esc(r.name)}</option>`).join('')}
                </select>
                <button class="btn btn-primary btn-sm" onclick="NexusCustomer.applyGameFilters()">Filter</button>
                <button class="btn btn-secondary btn-sm" onclick="NexusCustomer.resetGameFilters()">Reset</button>
            </div>

            ${games.length === 0 ? `<div class="card empty-state">No games match your selected filters. Try clearing a filter above.</div>` : `
                <div class="grid-3">
                    ${games.map(g => `
                        <div class="card media-card">
                            <img class="media-thumb" src="${NexusApp.esc(g.cover_url)}" alt="${NexusApp.esc(g.title)}" onerror="this.src='https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80'">
                            <div class="media-body">
                                <div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px;">
                                        <span class="badge badge-info">${NexusApp.esc(g.genre)}</span>
                                        <span class="badge badge-${NexusApp.esc(g.status)}">${NexusApp.esc(g.status)}</span>
                                    </div>
                                    <h3 style="font-size:1.08rem; margin-bottom:4px;">${NexusApp.esc(g.title)}</h3>
                                    <div style="font-size:0.78rem; color:var(--neon-blue); font-weight:600; margin-bottom:8px;">🎮 Platform: ${NexusApp.esc(g.platform)}</div>
                                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:12px;">${NexusApp.esc(g.description)}</p>
                                </div>

                                <div style="border-top:1px solid var(--border-subtle); padding-top:10px;">
                                    <div style="font-size:0.74rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:6px;">
                                        📍 Exact Rooms Where Available (${(g.available_rooms || []).length}):
                                    </div>
                                    <div class="chip-list">
                                        ${(g.available_rooms || []).length === 0
                                            ? '<span class="chip" style="color:var(--danger);">Not currently assigned to any room</span>'
                                            : g.available_rooms.map(ar => `
                                                <span class="chip" style="border-color:${ar.status === 'available' ? 'rgba(16,185,129,0.5)' : 'var(--border-subtle)'}">
                                                    ${NexusApp.esc(ar.name)} (${NexusApp.esc(ar.status.toUpperCase())})
                                                </span>
                                            `).join('')
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        `;
    },

    applyGameFilters() {
        NexusApp.state.gameFilters = {
            search: document.getElementById('game-filter-search').value.trim(),
            genre: document.getElementById('game-filter-genre').value,
            platform: document.getElementById('game-filter-platform').value,
            room_id: document.getElementById('game-filter-room').value
        };
        this.renderGameCatalog(document.getElementById('app-main-view'));
    },

    resetGameFilters() {
        NexusApp.state.gameFilters = { search: '', genre: '', platform: '', room_id: '' };
        this.renderGameCatalog(document.getElementById('app-main-view'));
    },

    // =========================================================================
    // 5. FOOD AND BEVERAGE MENU & CART (QR Table Ordering + Digital Payment)
    // =========================================================================
    renderFoodMenu(container) {
        const items = (NexusApp.state.menu && NexusApp.state.menu.menu_items) || [];
        const cart = NexusApp.state.cart || [];
        const rooms = (NexusApp.state.roomsState && NexusApp.state.roomsState.rooms) || [];
        const ownRoom = rooms.find(r => r.current_session && r.current_session.is_own_session);
        const qrRoomId = NexusApp.state.qrRoomId || (ownRoom ? ownRoom.id : '');
        const qrRoomObj = rooms.find(r => r.id === qrRoomId);

        const cartTotal = cart.reduce((sum, c) => sum + (c.price * c.quantity), 0);
        const totalQty = cart.reduce((sum, c) => sum + c.quantity, 0);

        container.innerHTML = `
            <div class="alert-banner info" style="margin-bottom:20px;">
                <div>
                    <strong>📱 ${qrRoomObj ? `Terhubung ke Meja / Ruangan via QR: ${NexusApp.esc(qrRoomObj.name)}` : 'Sistem Pemesanan Menu & QR Code Meja (NexusFlow)'}</strong>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:2px;">
                        Pilih menu &rarr; Sistem menghitung total otomatis &rarr; Bayar via QRIS Digital atau Kasir &rarr; Pesanan otomatis masuk ke Dashboard Dapur/Barista.
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="NexusApp.openQrScannerSimulatorModal()">📱 Pilih / Scan QR Meja</button>
                </div>
            </div>

            <div class="grid-2" style="grid-template-columns: 2fr 1fr; align-items:start;">
                <div>
                    <div class="grid-2">
                        ${items.map(item => `
                            <div class="card media-card">
                                <img class="media-thumb" src="${NexusApp.esc(item.image_url)}" alt="${NexusApp.esc(item.name)}" onerror="this.src='https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80'">
                                <div class="media-body">
                                    <div>
                                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                            <span class="badge badge-info">${NexusApp.esc(item.category)}</span>
                                            <span class="badge ${item.stock <= 0 ? 'badge-danger' : (item.is_low_stock ? 'badge-warning' : 'badge-available')}">
                                                ${item.stock <= 0 ? 'Stok Habis' : `Stok: ${item.stock}`}
                                            </span>
                                        </div>
                                        <h3 style="font-size:1.05rem; margin-bottom:4px;">${NexusApp.esc(item.name)}</h3>
                                        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">${NexusApp.esc(item.description)}</p>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid var(--border-subtle);">
                                        <strong style="font-size:1.12rem; color:#ffffff;">${NexusApp.money(item.price)}</strong>
                                        <button type="button" class="btn btn-primary btn-sm" ${item.stock <= 0 ? 'disabled' : ''} onclick="NexusCustomer.addToCart('${NexusApp.esc(item.id)}')">
                                            + Tambah Pesanan
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="card card-neon" style="position:sticky; top:90px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <h3>Ringkasan Pesanan</h3>
                        <span class="badge badge-info">${totalQty} Item</span>
                    </div>
                    ${cart.length === 0 ? `<div class="empty-state">Belum ada menu dipilih. Silakan klik "+ Tambah Pesanan" pada daftar menu di samping.</div>` : `
                        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
                            ${cart.map(c => `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#111111; border:1px solid #262626; padding:10px; border-radius:6px;">
                                    <div style="min-width:0; flex:1;">
                                        <div style="font-weight:600; font-size:0.86rem;">${NexusApp.esc(c.name)}</div>
                                        <div style="font-size:0.76rem; color:var(--text-secondary);">${NexusApp.money(c.price)} &times; ${c.quantity} = <strong style="color:#fff;">${NexusApp.money(c.price * c.quantity)}</strong></div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <button type="button" class="btn btn-secondary btn-sm" onclick="NexusCustomer.changeCartQty('${NexusApp.esc(c.item_id)}', -1)">-</button>
                                        <span style="font-weight:700; min-width:18px; text-align:center;">${c.quantity}</span>
                                        <button type="button" class="btn btn-secondary btn-sm" onclick="NexusCustomer.changeCartQty('${NexusApp.esc(c.item_id)}', 1)">+</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <form id="form-fnb-checkout" onsubmit="NexusCustomer.submitFoodOrder(event)">
                            <div class="form-group">
                                <label class="form-label">Nama Pemesan</label>
                                <input type="text" name="customer_name" class="form-control" value="${NexusApp.esc(NexusApp.state.user ? NexusApp.state.user.name : '')}" required placeholder="Masukkan nama Anda">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Meja / Ruangan Pengiriman</label>
                                <select name="room_id" class="form-control" onchange="NexusApp.state.qrRoomId = this.value">
                                    <option value="">Ambil di Kasir / Barista Counter</option>
                                    ${rooms.map(r => `<option value="${NexusApp.esc(r.id)}" ${(qrRoomId === r.id) ? 'selected' : ''}>${NexusApp.esc(r.name)} (${NexusApp.esc(r.status.toUpperCase())})</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Metode Pembayaran</label>
                                <select name="payment_method" class="form-control">
                                    <option value="QRIS / E-Wallet">QRIS / E-Wallet Digital (Otomatis)</option>
                                    <option value="Kasir">Bayar di Kasir (Tunai / Non-Tunai)</option>
                                    <option value="Card">Kartu Debit / Kredit</option>
                                    <option value="Room Tab">Gabung Tagihan Ruangan (Room Tab)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Catatan Dapur / Barista (Opsional)</label>
                                <input type="text" name="notes" class="form-control" placeholder="Contoh: Es sedikit, saus dipisah">
                            </div>

                            <div style="background:#111111; border:1px solid #333333; border-radius:6px; padding:12px; margin-bottom:14px;">
                                <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">
                                    <span>Subtotal (${totalQty} menu)</span>
                                    <span>${NexusApp.money(cartTotal)}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px dashed #333333;">
                                    <span style="font-weight:700;">Total Pembayaran:</span>
                                    <span style="font-size:1.35rem; font-weight:700; color:#ffffff;">${NexusApp.money(cartTotal)}</span>
                                </div>
                            </div>

                            <button type="submit" class="btn btn-primary" style="width:100%;">Bayar &amp; Kirim ke Dapur/Barista</button>
                        </form>
                    `}
                </div>
            </div>
        `;
    },

    addToCart(itemId) {
        const items = (NexusApp.state.menu && NexusApp.state.menu.menu_items) || [];
        const item = items.find(i => i.id === itemId);
        if (!item || item.stock <= 0) return;

        const existing = NexusApp.state.cart.find(c => c.item_id === itemId);
        if (existing) {
            if (existing.quantity + 1 > item.stock) {
                NexusApp.toast(`Only ${item.stock} units of "${item.name}" are available in stock.`, 'error');
                return;
            }
            existing.quantity++;
        } else {
            NexusApp.state.cart.push({
                item_id: item.id,
                name: item.name,
                price: Number(item.price),
                max_stock: Number(item.stock),
                quantity: 1
            });
        }
        NexusApp.renderShell();
        this.renderFoodMenu(document.getElementById('app-main-view'));
    },

    changeCartQty(itemId, delta) {
        const idx = NexusApp.state.cart.findIndex(c => c.item_id === itemId);
        if (idx === -1) return;
        const entry = NexusApp.state.cart[idx];
        const nextQty = entry.quantity + delta;
        if (nextQty <= 0) {
            NexusApp.state.cart.splice(idx, 1);
        } else if (nextQty > entry.max_stock) {
            NexusApp.toast(`Maximum available stock (${entry.max_stock}) reached.`, 'error');
            return;
        } else {
            entry.quantity = nextQty;
        }
        NexusApp.renderShell();
        this.renderFoodMenu(document.getElementById('app-main-view'));
    },

    async submitFoodOrder(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        const customerName = String(fd.get('customer_name') || '').trim();
        const roomId = String(fd.get('room_id') || '');
        const paymentMethod = String(fd.get('payment_method') || 'QRIS / E-Wallet');
        const notes = String(fd.get('notes') || '');
        const cart = NexusApp.state.cart || [];
        const cartTotal = cart.reduce((sum, c) => sum + (c.price * c.quantity), 0);

        const isQris = paymentMethod.toLowerCase().includes('qris') || paymentMethod.toLowerCase().includes('wallet');
        const qrisData = 'NEXUSARENA-PAY-' + Date.now() + '-' + Math.round(cartTotal);
        const qrisImg = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(qrisData);

        NexusApp.openModal('Konfirmasi Pembayaran Pesanan', `
            <div style="text-align:center; margin-bottom:14px;">
                <span class="badge badge-info" style="margin-bottom:6px;">METODE: ${NexusApp.esc(paymentMethod)}</span>
                <div style="font-size:1.5rem; font-weight:700; color:#ffffff;">${NexusApp.money(cartTotal)}</div>
                <div style="font-size:0.8rem; color:var(--text-secondary);">Pemesan: <strong>${NexusApp.esc(customerName)}</strong></div>
            </div>

            ${isQris ? `
                <div style="text-align:center; margin-bottom:14px;">
                    <div class="qr-frame">
                        <img src="${NexusApp.esc(qrisImg)}" alt="QRIS Payment" width="160" height="160" style="display:block;">
                        <div style="font-size:0.72rem; font-weight:700; margin-top:6px;">SCAN QRIS / E-WALLET</div>
                    </div>
                    <p style="font-size:0.78rem; color:var(--text-secondary);">Scan kode QRIS di atas menggunakan aplikasi m-Banking atau E-Wallet, lalu klik tombol konfirmasi di bawah.</p>
                </div>
            ` : `
                <div class="receipt-box" style="margin-bottom:14px;">
                    <div>Metode: <strong>${NexusApp.esc(paymentMethod)}</strong></div>
                    <div style="margin-top:6px; color:var(--text-secondary);">Pesanan akan diteruskan langsung ke Dashboard Dapur/Barista dan tercatat pada sistem kasir.</div>
                </div>
            `}

            <div style="display:flex; gap:10px;">
                <button type="button" class="btn btn-secondary" style="flex:1;" onclick="NexusApp.closeModal()">Batal</button>
                <button type="button" class="btn btn-primary" style="flex:2;" onclick="NexusCustomer.confirmAndExecuteFoodOrder(${JSON.stringify({
                    customer_name: customerName,
                    room_id: roomId,
                    payment_method: paymentMethod,
                    notes: notes,
                    order_source: NexusApp.state.qrRoomId ? 'qr_table' : 'portal'
                }).replace(/"/g, '&quot;')})">
                    ✓ Konfirmasi Pembayaran &amp; Kirim Pesanan
                </button>
            </div>
        `);
    },

    async confirmAndExecuteFoodOrder(payload) {
        try {
            const res = await NexusApp.api('orders.create', {
                ...payload,
                items: NexusApp.state.cart
            });
            const ord = res.order;
            NexusApp.state.cart = [];
            await NexusApp.refreshSystemState(false);

            NexusApp.openModal('Struk Pembayaran & Status Dapur/Barista', `
                <div class="receipt-box" style="margin-bottom:16px;">
                    <div style="text-align:center; border-bottom:1px dashed #404040; padding-bottom:10px; margin-bottom:10px;">
                        <div style="font-weight:700; font-size:0.95rem;">NEXUS ARENA — BUKTI PESANAN</div>
                        <div style="font-size:0.76rem; color:var(--text-secondary);">ID Pesanan: #${NexusApp.esc(ord.id)}</div>
                    </div>
                    <div style="margin-bottom:10px; font-size:0.82rem;">
                        <div>Pemesan : <strong>${NexusApp.esc(ord.customer_name)}</strong></div>
                        <div>Lokasi  : <strong>Ruangan / Meja ${NexusApp.esc(ord.room_number)}</strong></div>
                        <div>Metode  : <strong>${NexusApp.esc(ord.payment_method)} (${NexusApp.esc(ord.payment_status || 'Terverifikasi')})</strong></div>
                        <div>Status  : <strong>Masuk ke Dashboard Dapur/Barista (${NexusApp.esc(ord.status)})</strong></div>
                    </div>
                    <div style="border-top:1px dashed #404040; border-bottom:1px dashed #404040; padding:8px 0; margin-bottom:10px;">
                        ${(ord.items || []).map(i => `
                            <div style="display:flex; justify-content:space-between;">
                                <span>${i.quantity}x ${NexusApp.esc(i.name)}</span>
                                <span>${NexusApp.money(i.subtotal)}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; justify-content:space-between; font-weight:700; font-size:0.95rem;">
                        <span>TOTAL PEMBAYARAN</span>
                        <span>${NexusApp.money(ord.total_amount)}</span>
                    </div>
                </div>
                <p style="font-size:0.8rem; color:var(--text-secondary); text-align:center; margin-bottom:14px;">
                    ✓ Stok menu dan laporan penjualan harian telah diperbarui otomatis.
                </p>
                <button type="button" class="btn btn-primary" style="width:100%;" onclick="NexusApp.closeModal()">Selesai</button>
            `);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 6. MY ORDERS, ACTIVE SESSION & CONTROLLER REQUESTS
    // =========================================================================
    async renderMySessionAndOrders(container) {
        if (!NexusApp.state.user) {
            container.innerHTML = `
                <div class="card empty-state">
                    <h3>Sign In Required</h3>
                    <p style="margin:8px 0 16px;">Please sign in to track your live room usage, request additional controllers, and view your F&amp;B orders.</p>
                    <button class="btn btn-primary" onclick="NexusApp.openAuthModal('login')">Sign In</button>
                </div>
            `;
            return;
        }

        const [hist, ctrlData] = await Promise.all([
            NexusApp.api('profile.history'),
            NexusApp.api('controllers.list')
        ]);

        const sessions = hist.sessions || [];
        const orders = hist.orders || [];
        const ctrlRequests = hist.controller_requests || [];
        const rooms = NexusApp.state.roomsState.rooms || [];
        const activeSession = sessions.find(s => s.status === 'active' || s.status === 'expired');

        container.innerHTML = `
            <div class="grid-2">
                <div class="card card-neon">
                    <h3 style="margin-bottom:10px;">⏱️ My Active Room Usage &amp; Live Timer</h3>
                    ${!activeSession ? `
                        <div class="empty-state">
                            <p>You do not have an active room session right now.</p>
                            <div style="margin-top:12px; display:flex; gap:8px; justify-content:center;">
                                <button class="btn btn-primary btn-sm" onclick="NexusApp.navigate('cust-rooms')">Check Available Rooms</button>
                                <button class="btn btn-secondary btn-sm" onclick="NexusApp.navigate('cust-vip')">Book VIP Suite</button>
                            </div>
                        </div>
                    ` : `
                        <div style="background:rgba(7,9,19,0.65); padding:16px; border-radius:10px; border:1px solid var(--border-color);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <strong style="font-size:1.15rem;">${NexusApp.esc(activeSession.room_name)}</strong>
                                <span class="badge badge-${NexusApp.esc(activeSession.status)}">${NexusApp.esc(activeSession.status)}</span>
                            </div>
                            <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">
                                <div>Game: <strong style="color:#fff;">${NexusApp.esc(activeSession.game_title)}</strong> • Controllers Assigned: <strong>${activeSession.controllers_assigned}</strong></div>
                                <div>Start: ${NexusApp.esc(String(activeSession.start_time).slice(11, 19))} • Estimated End: <strong>${NexusApp.esc(String(activeSession.scheduled_end_time).slice(11, 19))}</strong></div>
                                <div>Session Total: <strong style="color:var(--neon-blue);">${NexusApp.money(activeSession.total_amount)}</strong> (${activeSession.duration_hours} hrs)</div>
                            </div>
                            <div class="timer-box">
                                <div style="font-size:0.75rem; color:var(--text-secondary);">SERVER-SYNCHRONIZED REMAINING TIME</div>
                                <div class="timer-digits" data-timer-end="${activeSession.end_timestamp}">Calculating...</div>
                            </div>
                        </div>
                    `}

                    <hr style="border:none; border-top:1px solid var(--border-subtle); margin:18px 0;">

                    <h4 style="margin-bottom:8px;">🎮 Request Additional Controllers</h4>
                    <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">Need extra gamepads for local multiplayer? Availability is verified immediately before submission.</p>
                    <form onsubmit="NexusCustomer.submitControllerRequest(event)">
                        <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
                            <div class="form-group">
                                <label class="form-label">Select Room</label>
                                <select name="room_id" class="form-control" required>
                                    ${rooms.map(r => `<option value="${NexusApp.esc(r.id)}" ${(activeSession && activeSession.room_id === r.id) ? 'selected' : ''}>${NexusApp.esc(r.name)} (${r.available_controllers} extra avail)</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Quantity</label>
                                <input type="number" name="quantity" class="form-control" value="1" min="1" max="4" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notes (Optional)</label>
                            <input type="text" name="notes" class="form-control" placeholder="e.g., Need 2 extra DualSense controllers for 4P FC 26">
                        </div>
                        <button type="submit" class="btn btn-secondary" style="width:100%;">Request Additional Controller(s)</button>
                    </form>

                    ${ctrlRequests.length > 0 ? `
                        <div style="margin-top:14px;">
                            <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; margin-bottom:6px;">My Controller Requests:</div>
                            ${ctrlRequests.slice(0, 4).map(cr => `
                                <div style="display:flex; justify-content:space-between; font-size:0.82rem; padding:6px 0; border-bottom:1px solid var(--border-subtle);">
                                    <span>${NexusApp.esc(cr.room_name)} (+${cr.quantity} ${NexusApp.esc(cr.console)})</span>
                                    <span class="badge badge-${cr.status === 'approved' ? 'available' : (cr.status === 'rejected' ? 'danger' : 'pending')}">${NexusApp.esc(cr.status)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h3>🍔 My Food &amp; Beverage Orders (${orders.length})</h3>
                        <button class="btn btn-primary btn-sm" onclick="NexusApp.navigate('cust-menu')">+ New Order</button>
                    </div>
                    ${orders.length === 0 ? `<div class="empty-state">You haven't placed any food or drink orders yet.</div>` : `
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            ${orders.map(o => `
                                <div style="background:rgba(7,9,19,0.55); border:1px solid var(--border-subtle); border-radius:10px; padding:14px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                        <div>
                                            <strong>Order #${NexusApp.esc(o.id)}</strong>
                                            <span style="font-size:0.78rem; color:var(--neon-blue); margin-left:8px;">📍 Room: ${NexusApp.esc(o.room_number || 'Counter')}</span>
                                        </div>
                                        <span class="badge badge-${NexusApp.esc(String(o.status).toLowerCase())}">${NexusApp.esc(o.status)}</span>
                                    </div>
                                    <div style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:8px;">
                                        ${(o.items || []).map(l => `${l.quantity}&times; ${NexusApp.esc(l.name)} (${NexusApp.money(l.subtotal)})`).join(' • ')}
                                    </div>
                                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                                        <span>Total: <strong style="color:#fff;">${NexusApp.money(o.total_amount)}</strong></span>
                                        ${(o.status === 'Pending' || o.status === 'Accepted') ? `
                                            <button class="btn btn-danger btn-sm" onclick="NexusCustomer.cancelMyOrder('${NexusApp.esc(o.id)}')">Cancel Order</button>
                                        ` : `<span style="color:var(--text-secondary);">${NexusApp.esc(String(o.created_at).slice(0, 16).replace('T', ' '))}</span>`}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        `;
        NexusApp.tickLiveTimers();
    },

    async submitControllerRequest(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('controllers.request', {
                room_id: fd.get('room_id'),
                quantity: Number(fd.get('quantity')),
                notes: fd.get('notes')
            });
            NexusApp.toast('Controller request submitted! Admin notified.', 'success');
            await this.renderMySessionAndOrders(document.getElementById('app-main-view'));
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    async cancelMyOrder(orderId) {
        NexusApp.confirmDialog('Cancel F&B Order', 'Cancel this order and restore item stock?', async () => {
            try {
                await NexusApp.api('orders.status', { order_id: orderId, status: 'Cancelled' });
                NexusApp.toast('Order cancelled and stock restored.', 'info');
                await NexusApp.refreshSystemState(false);
            } catch (err) {
                NexusApp.toast(err.message, 'error');
            }
        });
    },

    // =========================================================================
    // 7. AI CHATBOT (Clearly labeled mode + Live Business Data)
    // =========================================================================
    renderAiChatbot(container) {
        const meta = NexusApp.state.chatbotMeta || {};
        const msgs = NexusApp.state.chatbotMessages || [];
        const suggestions = meta.suggested_questions || [
            'What rooms are available right now?',
            'Which room has Tekken 8?',
            'What are the VIP booking rates?',
            'How many controllers are available?',
            'How do I order food and drinks?',
            'How does the queue work?',
            'What are the business opening hours?'
        ];

        container.innerHTML = `
            <div class="alert-banner info">
                <div>
                    <strong>🤖 AI Concierge Chatbot — Mode: ${NexusApp.esc(meta.mode_label || 'Live-Data FAQ Assistant')}</strong>
                    <div style="font-size:0.8rem; margin-top:2px;">
                        Answers are generated using <strong>actual real-time business data</strong> (rooms, game locations, VIP rates, controllers, menu stock, and queues).
                        Need a real human admin instead? Switch to the <a href="javascript:void(0)" style="color:var(--neon-blue); font-weight:700;" onclick="NexusApp.navigate('cust-support')">Human Admin Support Chat</a> tab.
                    </div>
                </div>
                <span class="badge ${meta.ai_api_configured ? 'badge-available' : 'badge-warning'}">${meta.ai_api_configured ? 'External LLM Active' : 'Live-DB FAQ Mode'}</span>
            </div>

            <div class="grid-2" style="grid-template-columns: 2.2fr 1fr;">
                <div class="chat-window">
                    <div class="chat-header">
                        <div>
                            <strong>🤖 Nexus AI Concierge</strong>
                            <div style="font-size:0.75rem; color:var(--text-secondary);">Instant answers from live Firestore collections</div>
                        </div>
                        <span class="badge badge-occupied">Automated Bot</span>
                    </div>
                    <div class="chat-messages" id="ai-chat-messages">
                        ${msgs.map(m => `
                            <div class="chat-bubble ${m.sender === 'user' ? 'outgoing' : 'incoming'}">
                                <div style="white-space:pre-line;">${NexusApp.esc(String(m.text || '').replace(/\*\*/g, '').replace(/\*/g, ''))}</div>
                                <div class="chat-meta">${m.sender === 'user' ? 'You' : 'Nexus Bot'} • ${NexusApp.esc(m.time)}</div>
                            </div>
                        `).join('')}
                    </div>
                    <form class="chat-input-bar" onsubmit="NexusCustomer.sendAiChatbotQuestion(event)">
                        <input type="text" id="ai-chat-input" class="form-control" placeholder="Ask about available rooms, games, VIP rates, controllers, or menu..." required>
                        <button type="submit" class="btn btn-primary">Ask Bot</button>
                    </form>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:10px;">💡 Quick Questions</h3>
                    <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">Click any prompt below to query live arena availability:</p>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${suggestions.map(q => `
                            <button type="button" class="btn btn-secondary btn-sm" style="justify-content:flex-start; text-align:left;" onclick="NexusCustomer.askQuickQuestion('${NexusApp.esc(q)}')">
                                &rarr; ${NexusApp.esc(q)}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        const box = document.getElementById('ai-chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
    },

    async askQuickQuestion(q) {
        const input = document.getElementById('ai-chat-input');
        if (input) input.value = q;
        await this.processAiQuestion(q);
    },

    async sendAiChatbotQuestion(e) {
        e.preventDefault();
        const input = document.getElementById('ai-chat-input');
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        await this.processAiQuestion(q);
    },

    async processAiQuestion(q) {
        const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        NexusApp.state.chatbotMessages.push({ sender: 'user', text: q, time: nowStr });
        this.renderAiChatbot(document.getElementById('app-main-view'));

        try {
            const res = await NexusApp.api('chatbot.ask', { question: q });
            NexusApp.state.chatbotMessages.push({
                sender: 'bot',
                text: res.reply,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            this.renderAiChatbot(document.getElementById('app-main-view'));
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 8. HUMAN ADMIN SUPPORT CHAT (Separate from AI Chatbot)
    // =========================================================================
    async renderHumanSupport(container) {
        if (!NexusApp.state.user) {
            container.innerHTML = `
                <div class="card empty-state">
                    <h3>Sign In to Chat with a Human Admin</h3>
                    <p style="margin:8px 0 16px;">Human support conversations are linked to your player account and active gaming room.</p>
                    <button class="btn btn-primary" onclick="NexusApp.openAuthModal('login')">Sign In</button>
                </div>
            `;
            return;
        }

        const state = await NexusApp.api('support.state');
        const online = Boolean(state.admin_online);
        const messages = state.messages || [];
        const conv = state.conversation;

        container.innerHTML = `
            <div class="alert-banner ${online ? 'info' : 'warning'}">
                <div>
                    <strong>💬 Live Human Admin Support Desk (Separate from AI Bot)</strong>
                    <div style="font-size:0.82rem; margin-top:2px;">
                        ${online ? '🟢 An Administrator is currently ONLINE and monitoring support requests.' : '🟡 Admins are currently away from the desk. Leave a message and we will respond shortly.'}
                        ${conv && conv.room_number ? ` • Linked to Room: <strong>${NexusApp.esc(conv.room_number)}</strong>` : ''}
                    </div>
                </div>
                <span class="badge ${online ? 'badge-available' : 'badge-warning'}">${online ? 'Admin Online' : 'Admin Away'}</span>
            </div>

            <div class="chat-window">
                <div class="chat-header">
                    <div>
                        <strong>🎧 Human Support Conversation</strong>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">Direct line to Nexus Arena Floor Staff &amp; Admins</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="NexusCustomer.renderHumanSupport(document.getElementById('app-main-view'))">&#8635; Refresh Messages</button>
                </div>

                <div class="chat-messages" id="human-support-messages">
                    ${messages.length === 0 ? `
                        <div class="empty-state">${NexusApp.esc(state.welcome_message || 'Send a message below to reach a human administrator.')}</div>
                    ` : messages.map(m => {
                        const isMe = m.sender_role === 'customer';
                        return `
                            <div class="chat-bubble ${isMe ? 'outgoing' : 'incoming'}">
                                <div style="font-weight:700; font-size:0.76rem; margin-bottom:3px; color:${isMe ? 'var(--neon-blue)' : '#e9d5ff'};">
                                    ${NexusApp.esc(m.sender_name)} (${NexusApp.esc(m.sender_role.toUpperCase())})
                                </div>
                                <div>${NexusApp.esc(m.message)}</div>
                                <div class="chat-meta">
                                    ${NexusApp.esc(String(m.created_at).slice(0, 16).replace('T', ' '))} • ${m.is_read ? '✓✓ Read' : '✓ Sent'}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <form class="chat-input-bar" onsubmit="NexusCustomer.sendHumanSupportMsg(event)">
                    <input type="text" id="human-support-input" class="form-control" placeholder="Type your message to the human admin team..." required>
                    <button type="submit" class="btn btn-primary">Send to Admin</button>
                </form>
            </div>
        `;
        const box = document.getElementById('human-support-messages');
        if (box) box.scrollTop = box.scrollHeight;
    },

    async sendHumanSupportMsg(e) {
        e.preventDefault();
        const input = document.getElementById('human-support-input');
        const msg = input.value.trim();
        if (!msg) return;
        input.value = '';
        try {
            await NexusApp.api('support.send', { message: msg });
            NexusApp.toast('Message sent to human admin support.', 'success');
            await this.renderHumanSupport(document.getElementById('app-main-view'));
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 9. RATINGS AND FEEDBACK
    // =========================================================================
    async renderFeedback(container) {
        const fbData = await NexusApp.api('feedback.list');
        const list = fbData.feedback_list || [];
        const eligibleSessions = fbData.eligible_sessions || [];

        container.innerHTML = `
            <div class="grid-2">
                <div class="card card-neon">
                    <h3 style="margin-bottom:8px;">⭐ Submit Session Rating &amp; Feedback</h3>
                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:14px;">
                        Share a review, report a complaint, or suggest an improvement. Duplicate reviews for the same session are prevented unless an admin enables correction.
                    </p>
                    ${!NexusApp.state.user ? `
                        <div class="empty-state">
                            <p style="margin-bottom:10px;">Please sign in to submit a rating or feedback.</p>
                            <button class="btn btn-primary btn-sm" onclick="NexusApp.openAuthModal('login')">Sign In</button>
                        </div>
                    ` : `
                        <form onsubmit="NexusCustomer.submitFeedbackForm(event)">
                            <div class="form-group">
                                <label class="form-label">Link to Rental Session</label>
                                <select name="session_id" class="form-control">
                                    <option value="">General Facility / Order Feedback</option>
                                    ${eligibleSessions.map(s => `<option value="${NexusApp.esc(s.id)}">${NexusApp.esc(s.room_name)} — ${NexusApp.esc(s.date)} (${NexusApp.esc(s.id)})</option>`).join('')}
                                </select>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                                <div class="form-group">
                                    <label class="form-label">Star Rating (1 to 5)</label>
                                    <select name="rating" class="form-control" required>
                                        <option value="5">★★★★★ (5 - Excellent)</option>
                                        <option value="4">★★★★☆ (4 - Good)</option>
                                        <option value="3">★★★☆☆ (3 - Average)</option>
                                        <option value="2">★★☆☆☆ (2 - Below Average)</option>
                                        <option value="1">★☆☆☆☆ (1 - Poor)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Feedback Type</label>
                                    <select name="category" class="form-control" required>
                                        <option value="review">Public Review</option>
                                        <option value="suggestion">Suggestion for Improvement</option>
                                        <option value="complaint">Private Complaint to Admin</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Your Comments</label>
                                <textarea name="comment" rows="4" class="form-control" required placeholder="Tell us about the consoles, screen quality, food delivery, or staff service..."></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary" style="width:100%;">Submit Feedback</button>
                        </form>
                    `}
                </div>

                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <div>
                            <h3>🌟 Community Reviews</h3>
                            <div style="font-size:0.8rem; color:var(--text-secondary);">Privacy-protected verified player ratings</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:1.5rem; font-weight:800; color:#fbbf24;">★ ${Number(fbData.average_rating || 5).toFixed(2)}</div>
                            <div style="font-size:0.75rem; color:var(--text-secondary);">${fbData.total_reviews || 0} Total Ratings</div>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:12px;">
                        ${list.length === 0 ? `<div class="empty-state">No reviews published yet.</div>` : list.map(item => `
                            <div style="background:rgba(7,9,19,0.55); border:1px solid var(--border-subtle); border-radius:10px; padding:14px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                    <div>
                                        <strong>${NexusApp.esc(item.customer_display_name || 'Verified Gamer')}</strong>
                                        <span class="badge badge-info" style="margin-left:6px;">${NexusApp.esc(item.room_name || 'Arena')}</span>
                                    </div>
                                    <span style="color:#fbbf24; font-weight:700;">${'★'.repeat(Number(item.rating || 5))}${'☆'.repeat(5 - Number(item.rating || 5))}</span>
                                </div>
                                <p style="font-size:0.86rem; color:var(--text-primary); margin-bottom:6px;">"${NexusApp.esc(item.comment)}"</p>
                                ${item.admin_response ? `
                                    <div style="background:rgba(0,240,255,0.08); border-left:3px solid var(--neon-blue); padding:8px 10px; font-size:0.8rem; margin-top:8px;">
                                        <strong style="color:var(--neon-blue);">Admin Reply:</strong> ${NexusApp.esc(item.admin_response)}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    async submitFeedbackForm(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('feedback.submit', {
                session_id: fd.get('session_id'),
                rating: Number(fd.get('rating')),
                category: fd.get('category'),
                comment: fd.get('comment')
            });
            NexusApp.toast('Thank you! Your feedback has been recorded.', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 10. PROFILE & BOOKING HISTORY
    // =========================================================================
    async renderProfile(container) {
        const user = NexusApp.state.user;
        if (!user) {
            container.innerHTML = `
                <div class="card empty-state">
                    <h3>Sign In to View Your Profile</h3>
                    <button class="btn btn-primary" style="margin-top:12px;" onclick="NexusApp.openAuthModal('login')">Sign In</button>
                </div>
            `;
            return;
        }

        const hist = await NexusApp.api('profile.history');
        const sessions = hist.sessions || [];
        const bookings = hist.bookings || [];

        container.innerHTML = `
            <div class="grid-2">
                <div class="card">
                    <h3 style="margin-bottom:12px;">👤 Account Profile Settings</h3>
                    <form onsubmit="NexusCustomer.submitProfileUpdate(event)">
                        <div class="form-group">
                            <label class="form-label">Email Address (Verified)</label>
                            <input type="email" class="form-control" value="${NexusApp.esc(user.email)}" disabled>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Display Name</label>
                            <input type="text" name="name" class="form-control" value="${NexusApp.esc(user.name)}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Phone Number</label>
                            <input type="text" name="phone" class="form-control" value="${NexusApp.esc(user.phone || '')}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">New Password (leave blank to keep current)</label>
                            <input type="password" name="new_password" class="form-control" placeholder="••••••••">
                        </div>
                        <button type="submit" class="btn btn-primary">Save Profile Changes</button>
                    </form>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:12px;">🕹️ My Rental Session History (${sessions.length})</h3>
                    ${sessions.length === 0 ? `<div class="empty-state">No rental sessions recorded yet.</div>` : `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Room</th>
                                        <th>Game</th>
                                        <th>Duration</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${sessions.map(s => `
                                        <tr>
                                            <td><strong>${NexusApp.esc(s.room_name)}</strong></td>
                                            <td>${NexusApp.esc(s.game_title)}</td>
                                            <td>${s.duration_hours} hrs</td>
                                            <td>${NexusApp.money(s.total_amount)}</td>
                                            <td><span class="badge badge-${NexusApp.esc(s.status)}">${NexusApp.esc(s.status)}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}

                    <h3 style="margin:20px 0 12px;">👑 VIP Booking History (${bookings.length})</h3>
                    ${bookings.length === 0 ? `<div class="empty-state">No VIP bookings yet.</div>` : `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>VIP Suite</th>
                                        <th>Date &amp; Slot</th>
                                        <th>Price</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${bookings.map(b => `
                                        <tr>
                                            <td><strong>${NexusApp.esc(b.room_name)}</strong></td>
                                            <td>${NexusApp.esc(b.booking_date)} (${NexusApp.esc(b.start_time)}-${NexusApp.esc(b.end_time)})</td>
                                            <td>${NexusApp.money(b.total_price)}</td>
                                            <td><span class="badge badge-${NexusApp.esc(b.status)}">${NexusApp.esc(b.status)}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    async submitProfileUpdate(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            const res = await NexusApp.api('profile.update', {
                name: fd.get('name'),
                phone: fd.get('phone'),
                new_password: fd.get('new_password')
            });
            NexusApp.state.user = res.user;
            NexusApp.toast('Profile updated successfully.', 'success');
            NexusApp.renderShell();
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    }
};
