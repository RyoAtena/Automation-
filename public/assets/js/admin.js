window.NexusAdmin = {
    financeFilter: {
        period: 'all',
        start_date: '',
        end_date: '',
        include_demo: 'true'
    },
    activeSupportConvId: null,

    async render(pageId) {
        const container = document.getElementById('app-main-view');
        switch (pageId) {
            case 'adm-dashboard':
                return this.renderDashboard(container);
            case 'adm-rooms':
                return this.renderRoomsAndSessions(container);
            case 'adm-bookings':
                return this.renderBookingsAndQueue(container);
            case 'adm-games':
                return this.renderGamesMapping(container);
            case 'adm-controllers':
                return this.renderControllers(container);
            case 'adm-menu':
                return this.renderMenuAndStock(container);
            case 'adm-orders':
                return this.renderOrders(container);
            case 'adm-finance':
                return this.renderFinance(container);
            case 'adm-support':
                return this.renderSupport(container);
            case 'adm-feedback':
                return this.renderFeedbackAdmin(container);
            case 'adm-users':
                return this.renderUsers(container);
            case 'adm-settings':
                return this.renderSettings(container);
            default:
                return this.renderDashboard(container);
        }
    },

    // =========================================================================
    // 1. ADMIN DASHBOARD
    // =========================================================================
    async renderDashboard(container) {
        const [fin, bookingsData, ordersData] = await Promise.all([
            NexusApp.api('finance.report', null, { include_demo: 'true' }),
            NexusApp.api('bookings.list'),
            NexusApp.api('orders.list')
        ]);

        const rs = NexusApp.state.roomsState || {};
        const rooms = rs.rooms || [];
        const occupiedRooms = rooms.filter(r => r.status === 'occupied');
        const expiredRooms = occupiedRooms.filter(r => r.current_session && r.current_session.is_expired);
        const lowTimeRooms = occupiedRooms.filter(r => r.current_session && r.current_session.is_low_time);
        const lowStockItems = (NexusApp.state.menu && NexusApp.state.menu.low_stock_warnings) || [];
        const sum = fin.summary || {};
        const fb = NexusApp.state.feedbackSummary || {};
        const upcomingBookings = (bookingsData.bookings || []).filter(b => b.status === 'pending' || b.status === 'confirmed').slice(0, 5);
        const activeOrders = (ordersData.orders || []).filter(o => !['Delivered', 'Cancelled'].includes(o.status)).slice(0, 5);

        container.innerHTML = `
            ${expiredRooms.length > 0 ? `
                <div class="alert-banner danger">
                    <div>
                        <strong>🚨 ${expiredRooms.length} Paid Session(s) Have Expired!</strong>
                        <div style="font-size:0.82rem;">Per business rules, expired sessions are marked EXPIRED without auto-terminating. Please extend or complete: ${expiredRooms.map(r => `<strong>${NexusApp.esc(r.name)}</strong>`).join(', ')}.</div>
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="NexusApp.navigate('adm-rooms')">Manage Expired Sessions</button>
                </div>
            ` : ''}

            ${lowTimeRooms.length > 0 ? `
                <div class="alert-banner warning">
                    <div>
                        <strong>⏳ Low Remaining Time Warning:</strong>
                        <span>${lowTimeRooms.map(r => `${NexusApp.esc(r.name)} (${NexusApp.formatDuration(r.current_session.remaining_seconds)} left)`).join(' • ')}</span>
                    </div>
                    <button class="btn btn-warning btn-sm" onclick="NexusApp.navigate('adm-rooms')">View Timers</button>
                </div>
            ` : ''}

            ${lowStockItems.length > 0 ? `
                <div class="alert-banner warning">
                    <div>
                        <strong>📦 Low F&amp;B Inventory Alert (${lowStockItems.length} item):</strong>
                        <span>${lowStockItems.map(i => `${NexusApp.esc(i.name)} (${i.stock} left)`).join(' • ')}</span>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="NexusApp.navigate('adm-menu')">Restock Inventory</button>
                </div>
            ` : ''}

            <div class="grid-4">
                <div class="card stat-card">
                    <span class="stat-label">Total Revenue</span>
                    <div class="stat-value" style="color:var(--neon-blue);">${NexusApp.money(sum.total_revenue)}</div>
                    <span class="stat-sub">Rental: ${NexusApp.money(sum.rental_revenue)} • F&amp;B: ${NexusApp.money(sum.fnb_revenue)}</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Estimated Net Profit</span>
                    <div class="stat-value" style="color:${sum.estimated_profit >= 0 ? '#34d399' : '#f87171'};">${NexusApp.money(sum.estimated_profit)}</div>
                    <span class="stat-sub">After ${NexusApp.money(sum.operating_expenses)} recorded expenses</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Rooms &amp; Queue</span>
                    <div class="stat-value">${occupiedRooms.length} <span style="font-size:1rem; color:var(--text-secondary);">/ ${rooms.length} Occupied</span></div>
                    <span class="stat-sub">${rs.waiting_queue_count || 0} Customer(s) in Waiting Queue</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Customer Rating</span>
                    <div class="stat-value" style="color:#fbbf24;">★ ${Number(fb.average_rating || 5).toFixed(2)}</div>
                    <span class="stat-sub">${fb.total_reviews || 0} Reviews • ${sum.completed_sessions_count || 0} Completed Sessions</span>
                </div>
            </div>

            <div class="grid-2">
                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h3>⏱️ Live Occupied Rooms &amp; Timers (${occupiedRooms.length})</h3>
                        <button class="btn btn-primary btn-sm" onclick="NexusApp.navigate('adm-rooms')">Manage Rooms &amp; Sessions</button>
                    </div>
                    ${occupiedRooms.length === 0 ? `<div class="empty-state">No rooms are currently occupied.</div>` : `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Room</th>
                                        <th>Customer</th>
                                        <th>End Time</th>
                                        <th>Remaining</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${occupiedRooms.map(r => {
                                        const s = r.current_session;
                                        return `
                                            <tr>
                                                <td><strong>${NexusApp.esc(r.name)}</strong></td>
                                                <td>${NexusApp.esc(s ? s.customer_name : '—')}</td>
                                                <td>${NexusApp.esc(s ? String(s.scheduled_end_time).slice(11, 16) : '—')}</td>
                                                <td>
                                                    ${s ? `<span class="timer-digits" style="font-size:1.05rem;" data-timer-end="${s.end_timestamp}">${NexusApp.formatDuration(s.remaining_seconds)}</span>` : '—'}
                                                </td>
                                                <td><span class="badge badge-${s && s.is_expired ? 'danger' : 'occupied'}">${NexusApp.esc(s ? s.status : 'occupied')}</span></td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>

                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h3>📅 Upcoming VIP Bookings (${upcomingBookings.length})</h3>
                        <button class="btn btn-secondary btn-sm" onclick="NexusApp.navigate('adm-bookings')">All Bookings &amp; Queue</button>
                    </div>
                    ${upcomingBookings.length === 0 ? `<div class="empty-state">No upcoming VIP bookings.</div>` : `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Suite</th>
                                        <th>Customer</th>
                                        <th>Date &amp; Slot</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${upcomingBookings.map(b => `
                                        <tr>
                                            <td><strong>${NexusApp.esc(b.room_name)}</strong></td>
                                            <td>${NexusApp.esc(b.customer_name)}</td>
                                            <td>${NexusApp.esc(b.booking_date)} (${NexusApp.esc(b.start_time)}-${NexusApp.esc(b.end_time)})</td>
                                            <td>${NexusApp.money(b.total_price)}</td>
                                            <td><span class="badge badge-${NexusApp.esc(b.status)}">${NexusApp.esc(b.status)}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}

                    <div style="display:flex; justify-content:space-between; align-items:center; margin:18px 0 10px;">
                        <h3>🍔 Active Kitchen F&amp;B Orders (${activeOrders.length})</h3>
                        <button class="btn btn-secondary btn-sm" onclick="NexusApp.navigate('adm-orders')">Manage Orders</button>
                    </div>
                    ${activeOrders.length === 0 ? `<div class="empty-state">No active F&amp;B orders pending delivery.</div>` : `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Order</th>
                                        <th>Room</th>
                                        <th>Customer</th>
                                        <th>Total</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${activeOrders.map(o => `
                                        <tr>
                                            <td><strong>#${NexusApp.esc(o.id)}</strong></td>
                                            <td>Room ${NexusApp.esc(o.room_number)}</td>
                                            <td>${NexusApp.esc(o.customer_name)}</td>
                                            <td>${NexusApp.money(o.total_amount)}</td>
                                            <td><span class="badge badge-info">${NexusApp.esc(o.status)}</span></td>
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

    // =========================================================================
    // 2. ROOM AND SESSION MANAGEMENT (with Live Countdown & Session Controls)
    // =========================================================================
    async renderRoomsAndSessions(container) {
        const rooms = NexusApp.state.roomsState.rooms || [];
        const occupied = rooms.filter(r => r.status === 'occupied' && r.current_session);

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                <div>
                    <h3>⏱️ Live Occupied Rooms &amp; Authoritative Session Timers (${occupied.length})</h3>
                    <p style="font-size:0.83rem; color:var(--text-secondary);">Server database is the source of truth. Expired sessions alert the admin and wait for explicit extension or completion.</p>
                </div>
                <button class="btn btn-primary" onclick="NexusAdmin.openRoomModal()">+ Add New Gaming Room</button>
            </div>

            ${occupied.length > 0 ? `
                <div class="card card-neon" style="margin-bottom:24px;">
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Room</th>
                                    <th>Customer</th>
                                    <th>Game &amp; Gamepads</th>
                                    <th>Start &rarr; Scheduled End</th>
                                    <th>Live Countdown</th>
                                    <th>Session Status</th>
                                    <th>Session Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${occupied.map(r => {
                                    const s = r.current_session;
                                    const boxClass = s.is_expired ? 'expired-time' : (s.is_low_time ? 'low-time' : '');
                                    return `
                                        <tr>
                                            <td><strong>${NexusApp.esc(r.name)}</strong><div style="font-size:0.75rem; color:var(--text-secondary);">${NexusApp.money(r.rate_per_hour)}/hr</div></td>
                                            <td><strong>${NexusApp.esc(s.customer_name)}</strong></td>
                                            <td>${NexusApp.esc(s.game_title)} <span class="badge badge-info">${s.controllers_assigned}P</span></td>
                                            <td>
                                                <div>Start: ${NexusApp.esc(String(s.start_time).slice(11, 19))}</div>
                                                <div>End: <strong>${NexusApp.esc(String(s.scheduled_end_time).slice(11, 19))}</strong></div>
                                            </td>
                                            <td>
                                                <div class="timer-box ${boxClass}" style="margin:0; padding:6px 10px;">
                                                    <div class="timer-digits" style="font-size:1.15rem;" data-timer-end="${s.end_timestamp}">${NexusApp.formatDuration(s.remaining_seconds)}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge badge-${s.is_expired ? 'danger' : (s.is_low_time ? 'warning' : 'active')}">
                                                    ${s.is_expired ? 'EXPIRED (ACTION NEEDED)' : (s.is_low_time ? 'LOW TIME' : 'ACTIVE')}
                                                </span>
                                            </td>
                                            <td>
                                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                                    <button class="btn btn-warning btn-sm" onclick="NexusAdmin.openExtendSessionModal('${NexusApp.esc(s.id)}', '${NexusApp.esc(r.name)}')">+ Extend</button>
                                                    <button class="btn btn-success btn-sm" onclick="NexusAdmin.endSession('${NexusApp.esc(s.id)}', 'complete', '${NexusApp.esc(r.name)}')">✓ End Session</button>
                                                    <button class="btn btn-danger btn-sm" onclick="NexusAdmin.endSession('${NexusApp.esc(s.id)}', 'cancel', '${NexusApp.esc(r.name)}')">Cancel</button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : ''}

            <h3 style="margin-bottom:14px;">🖥️ All Gaming Rooms &amp; Console Stations (${rooms.length})</h3>
            <div class="grid-3">
                ${rooms.map(r => {
                    const s = r.current_session;
                    return `
                        <div class="card room-card ${r.type === 'vip' ? 'vip-border' : ''}">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                                    <div>
                                        <span class="badge ${r.type === 'vip' ? 'badge-vip' : 'badge-info'}">${NexusApp.esc(r.type.toUpperCase())} • #${NexusApp.esc(r.room_number)}</span>
                                        <h3 style="margin-top:4px; font-size:1.05rem;">${NexusApp.esc(r.name)}</h3>
                                    </div>
                                    <span class="badge badge-${NexusApp.esc(r.status)}">${NexusApp.esc(r.status)}</span>
                                </div>
                                <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:10px;">${NexusApp.esc(r.description || '')}</p>
                                <div style="font-size:0.82rem; margin-bottom:8px;">
                                    <div><strong>Rate:</strong> ${NexusApp.money(r.rate_per_hour)}/hr • <strong>Max Players:</strong> ${r.max_players}</div>
                                    <div><strong>Consoles:</strong> ${NexusApp.esc((r.consoles || []).join(', '))}</div>
                                    <div><strong>Controllers:</strong> ${r.available_controllers} available / ${r.total_controllers} total</div>
                                </div>
                                ${s ? `
                                    <div class="timer-box ${s.is_expired ? 'expired-time' : (s.is_low_time ? 'low-time' : '')}">
                                        <div style="font-size:0.75rem; color:var(--text-secondary);">Occupied by <strong>${NexusApp.esc(s.customer_name)}</strong> (${NexusApp.esc(s.game_title)})</div>
                                        <div class="timer-digits" data-timer-end="${s.end_timestamp}">${NexusApp.formatDuration(s.remaining_seconds)}</div>
                                    </div>
                                ` : ''}
                            </div>

                            <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border-subtle); display:flex; gap:8px; flex-wrap:wrap;">
                                ${(r.status === 'available' || r.status === 'reserved') ? `
                                    <button class="btn btn-primary btn-sm" style="flex:1;" onclick="NexusAdmin.openStartSessionModal('${NexusApp.esc(r.id)}')">▶ Start Session</button>
                                ` : ''}
                                ${s ? `
                                    <button class="btn btn-warning btn-sm" onclick="NexusAdmin.openExtendSessionModal('${NexusApp.esc(s.id)}', '${NexusApp.esc(r.name)}')">+ Extend</button>
                                    <button class="btn btn-success btn-sm" onclick="NexusAdmin.endSession('${NexusApp.esc(s.id)}', 'complete', '${NexusApp.esc(r.name)}')">End</button>
                                ` : ''}
                                <button class="btn btn-secondary btn-sm" onclick='NexusAdmin.openRoomModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>Edit Room</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    async openStartSessionModal(roomId, prefill = {}) {
        const room = (NexusApp.state.roomsState.rooms || []).find(r => r.id === roomId);
        if (!room) return;
        let users = [];
        try {
            const uRes = await NexusApp.api('users.list');
            users = uRes.users || [];
        } catch (_) {}

        const games = room.available_games || [];

        NexusApp.openModal('Start Gaming Session — ' + room.name, `
            <form onsubmit="NexusAdmin.submitStartSession(event)">
                <input type="hidden" name="room_id" value="${NexusApp.esc(room.id)}">
                <input type="hidden" name="queue_id" value="${NexusApp.esc(prefill.queue_id || '')}">
                <input type="hidden" name="booking_id" value="${NexusApp.esc(prefill.booking_id || '')}">

                <div class="form-group">
                    <label class="form-label">Select Registered Customer (or Walk-In)</label>
                    <select name="user_id" class="form-control" onchange="if(this.selectedIndex>0) document.getElementById('start-cust-name').value=this.options[this.selectedIndex].getAttribute('data-name')">
                        <option value="">Walk-In Customer</option>
                        ${users.map(u => `<option value="${NexusApp.esc(u.id)}" data-name="${NexusApp.esc(u.name)}" ${prefill.user_id === u.id ? 'selected' : ''}>${NexusApp.esc(u.name)} (${NexusApp.esc(u.email)})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Customer Display Name</label>
                    <input type="text" name="customer_name" id="start-cust-name" class="form-control" value="${NexusApp.esc(prefill.customer_name || 'Walk-In Gamer')}" required>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Duration (Hours)</label>
                        <input type="number" name="duration_hours" step="0.5" min="0.5" max="12" class="form-control" value="${prefill.duration_hours || 2}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Controllers Assigned (Max ${room.available_controllers})</label>
                        <input type="number" name="controllers_count" min="1" max="${Math.max(1, room.available_controllers)}" class="form-control" value="${Math.min(2, Math.max(1, room.available_controllers))}" required>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Select Game (Mapped to ${NexusApp.esc(room.name)})</label>
                    <select name="game_id" class="form-control">
                        <option value="">Open Console Session</option>
                        ${games.map(g => `<option value="${NexusApp.esc(g.id)}">${NexusApp.esc(g.title)} (${NexusApp.esc(g.platform)})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Payment Method</label>
                    <select name="payment_method" class="form-control">
                        <option value="Cash">Cash at Counter</option>
                        <option value="Card">Credit / Debit Card</option>
                        <option value="E-Wallet">E-Wallet / QRIS</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Start Session &amp; Record Payment</button>
            </form>
        `);
    },

    async submitStartSession(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('sessions.start', {
                room_id: fd.get('room_id'),
                user_id: fd.get('user_id'),
                customer_name: fd.get('customer_name'),
                duration_hours: Number(fd.get('duration_hours')),
                controllers_count: Number(fd.get('controllers_count')),
                game_id: fd.get('game_id'),
                payment_method: fd.get('payment_method'),
                queue_id: fd.get('queue_id'),
                booking_id: fd.get('booking_id')
            });
            NexusApp.closeModal();
            NexusApp.toast('Session started and transaction recorded!', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    openExtendSessionModal(sessionId, roomName) {
        NexusApp.openModal('Extend Session — ' + roomName, `
            <form onsubmit="NexusAdmin.submitExtendSession(event)">
                <input type="hidden" name="session_id" value="${NexusApp.esc(sessionId)}">
                <div class="form-group">
                    <label class="form-label">Additional Hours to Add</label>
                    <select name="additional_hours" class="form-control">
                        <option value="0.5">+0.5 Hour (30 mins)</option>
                        <option value="1" selected>+1.0 Hour</option>
                        <option value="2">+2.0 Hours</option>
                        <option value="3">+3.0 Hours</option>
                        <option value="4">+4.0 Hours</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Payment Method for Extension</label>
                    <select name="payment_method" class="form-control">
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="E-Wallet">E-Wallet</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Confirm Extension</button>
            </form>
        `);
    },

    async submitExtendSession(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('sessions.extend', {
                session_id: fd.get('session_id'),
                additional_hours: Number(fd.get('additional_hours')),
                payment_method: fd.get('payment_method')
            });
            NexusApp.closeModal();
            NexusApp.toast('Session extended!', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    endSession(sessionId, terminationType, roomName) {
        const label = terminationType === 'cancel' ? 'Cancel' : 'Complete & End';
        NexusApp.confirmDialog(
            label + ' Session — ' + roomName,
            `Are you sure you want to ${terminationType} the session in ${roomName}? This will release assigned controllers, mark the room Available, and automatically notify the next customer in the waiting queue.`,
            async () => {
                try {
                    const res = await NexusApp.api('sessions.end', {
                        session_id: sessionId,
                        termination_type: terminationType
                    });
                    let msg = `Session ${terminationType}d and room freed.`;
                    if (res.next_queue_notified) {
                        msg += ` Next customer in queue (${res.next_queue_notified.customer_name}) was automatically notified!`;
                    }
                    NexusApp.toast(msg, 'success');
                    await NexusApp.refreshSystemState(false);
                } catch (err) {
                    NexusApp.toast(err.message, 'error');
                }
            }
        );
    },

    openRoomModal(room = null) {
        const isEdit = Boolean(room);
        NexusApp.openModal(isEdit ? 'Edit Room — ' + room.name : 'Create New Gaming Room', `
            <form onsubmit="NexusAdmin.submitRoomForm(event)">
                <input type="hidden" name="id" value="${NexusApp.esc(room ? room.id : '')}">
                <div style="display:grid; grid-template-columns:1fr 2fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Room Number</label>
                        <input type="text" name="room_number" class="form-control" value="${NexusApp.esc(room ? room.room_number : '')}" required placeholder="105 or VIP-203">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Room Name</label>
                        <input type="text" name="name" class="form-control" value="${NexusApp.esc(room ? room.name : '')}" required placeholder="Room 105 - Cyber Pod E">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Room Type</label>
                        <select name="type" class="form-control">
                            <option value="regular" ${room && room.type === 'regular' ? 'selected' : ''}>Regular</option>
                            <option value="vip" ${room && room.type === 'vip' ? 'selected' : ''}>VIP Suite</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select name="status" class="form-control">
                            ${['available', 'occupied', 'reserved', 'maintenance', 'unavailable'].map(st => `<option value="${st}" ${room && room.status === st ? 'selected' : ''}>${st.toUpperCase()}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tarif per Jam (Rp)</label>
                        <input type="number" step="1000" name="rate_per_hour" class="form-control" value="${room ? room.rate_per_hour : 20000}" required>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:2fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Consoles (comma-separated)</label>
                        <input type="text" name="consoles" class="form-control" value="${NexusApp.esc(room ? (room.consoles || []).join(', ') : 'PlayStation 5')}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Players</label>
                        <input type="number" name="max_players" class="form-control" value="${room ? room.max_players : 4}" min="1" max="16" required>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Facilities (comma-separated)</label>
                    <input type="text" name="facilities" class="form-control" value="${NexusApp.esc(room ? (room.facilities || []).join(', ') : '55\" 4K 120Hz TV, DualSense Dock')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <input type="text" name="description" class="form-control" value="${NexusApp.esc(room ? room.description : '')}">
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">${isEdit ? 'Save Room Changes' : 'Create Room'}</button>
            </form>
        `);
    },

    async submitRoomForm(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('rooms.save', Object.fromEntries(fd.entries()));
            NexusApp.closeModal();
            NexusApp.toast('Room saved successfully.', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 3. BOOKING & QUEUE MANAGEMENT
    // =========================================================================
    async renderBookingsAndQueue(container) {
        const res = await NexusApp.api('bookings.list');
        const bookings = res.bookings || [];
        const queue = NexusApp.state.roomsState.queue || [];
        const availRooms = (NexusApp.state.roomsState.rooms || []).filter(r => r.status === 'available');

        container.innerHTML = `
            <div class="card" style="margin-bottom:24px;">
                <h3 style="margin-bottom:10px;">👑 VIP Room Bookings Management (${bookings.length})</h3>
                ${bookings.length === 0 ? `<div class="empty-state">No VIP bookings recorded.</div>` : `
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>VIP Suite</th>
                                    <th>Customer</th>
                                    <th>Date &amp; Time Slot</th>
                                    <th>Guests / Notes</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Admin Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${bookings.map(b => `
                                    <tr>
                                        <td><code>${NexusApp.esc(b.id)}</code></td>
                                        <td><strong>${NexusApp.esc(b.room_name)}</strong></td>
                                        <td>${NexusApp.esc(b.customer_name)}</td>
                                        <td>
                                            <div><strong>${NexusApp.esc(b.booking_date)}</strong></div>
                                            <div style="font-size:0.78rem; color:var(--neon-blue);">${NexusApp.esc(b.start_time)} - ${NexusApp.esc(b.end_time)} (${b.duration_hours}h)</div>
                                        </td>
                                        <td>${b.guests_count}P • <span style="font-size:0.8rem; color:var(--text-secondary);">${NexusApp.esc(b.notes || '—')}</span></td>
                                        <td><strong>${NexusApp.money(b.total_price)}</strong></td>
                                        <td><span class="badge badge-${NexusApp.esc(b.status)}">${NexusApp.esc(b.status)}</span></td>
                                        <td>
                                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                                ${b.status === 'pending' ? `
                                                    <button class="btn btn-success btn-sm" onclick="NexusAdmin.setBookingStatus('${NexusApp.esc(b.id)}', 'confirmed')">Approve</button>
                                                ` : ''}
                                                ${(b.status === 'confirmed' || b.status === 'pending') ? `
                                                    <button class="btn btn-primary btn-sm" onclick="NexusAdmin.openStartSessionModal('${NexusApp.esc(b.room_id)}', {user_id:'${NexusApp.esc(b.user_id)}', customer_name:'${NexusApp.esc(b.customer_name)}', duration_hours:${b.duration_hours}, booking_id:'${NexusApp.esc(b.id)}'})">▶ Start Session</button>
                                                    <button class="btn btn-danger btn-sm" onclick="NexusAdmin.setBookingStatus('${NexusApp.esc(b.id)}', 'cancelled')">Cancel</button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <div class="card">
                <h3 style="margin-bottom:10px;">📋 Active Room Waiting Queue (${queue.length})</h3>
                <p style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:14px;">Assign an available room to the next waiting customer in queue order.</p>
                ${queue.length === 0 ? `<div class="empty-state">Waiting queue is currently empty.</div>` : `
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Pos</th>
                                    <th>Customer</th>
                                    <th>Preference</th>
                                    <th>Party &amp; Hours</th>
                                    <th>Notes</th>
                                    <th>Status</th>
                                    <th>Assign Room &amp; Start</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${queue.map(q => `
                                    <tr>
                                        <td><strong>#${q.position}</strong></td>
                                        <td><strong>${NexusApp.esc(q.customer_name)}</strong></td>
                                        <td>${NexusApp.esc(q.preferred_console)} (${NexusApp.esc(q.preferred_room_type)})</td>
                                        <td>${q.party_size}P • ${q.requested_hours} hrs</td>
                                        <td>${NexusApp.esc(q.notes || '—')}</td>
                                        <td><span class="badge badge-${NexusApp.esc(q.status)}">${NexusApp.esc(q.status)}</span></td>
                                        <td>
                                            <div style="display:flex; gap:6px; align-items:center;">
                                                ${availRooms.length > 0 ? `
                                                    <select id="assign-room-q-${NexusApp.esc(q.id)}" class="form-control" style="padding:5px 8px; font-size:0.8rem; width:auto;">
                                                        ${availRooms.map(ar => `<option value="${NexusApp.esc(ar.id)}">${NexusApp.esc(ar.name)}</option>`).join('')}
                                                    </select>
                                                    <button class="btn btn-primary btn-sm" onclick="NexusAdmin.assignQueueToRoom('${NexusApp.esc(q.id)}', '${NexusApp.esc(q.user_id)}', '${NexusApp.esc(q.customer_name)}', ${q.requested_hours})">▶ Assign &amp; Start</button>
                                                ` : `<span style="font-size:0.78rem; color:var(--warning);">No Available Rooms</span>`}
                                                <button class="btn btn-danger btn-sm" onclick="NexusCustomer.cancelQueue('${NexusApp.esc(q.id)}')">Remove</button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
    },

    async setBookingStatus(bookingId, status) {
        try {
            await NexusApp.api('bookings.status', { booking_id: bookingId, status });
            NexusApp.toast('Booking status updated to ' + status.toUpperCase(), 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    assignQueueToRoom(queueId, userId, customerName, hours) {
        const sel = document.getElementById('assign-room-q-' + queueId);
        if (!sel || !sel.value) return;
        this.openStartSessionModal(sel.value, {
            queue_id: queueId,
            user_id: userId,
            customer_name: customerName,
            duration_hours: hours
        });
    },

    // =========================================================================
    // 4. GAME AND ROOM MAPPING
    // =========================================================================
    async renderGamesMapping(container) {
        const cat = await NexusApp.api('games.list');
        const games = cat.games || [];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                <div>
                    <h3>🎯 Game Catalog &amp; Exact Room Mapping (${games.length} Games)</h3>
                    <p style="font-size:0.83rem; color:var(--text-secondary);">Assign each game to the exact rooms where its disc or digital license is installed.</p>
                </div>
                <button class="btn btn-primary" onclick="NexusAdmin.openGameModal()">+ Add New Game</button>
            </div>

            <div class="card">
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Genre</th>
                                <th>Platform</th>
                                <th>Assigned Rooms (Exact Location Mapping)</th>
                                <th>Plays</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${games.map(g => `
                                <tr>
                                    <td><strong>${NexusApp.esc(g.title)}</strong></td>
                                    <td>${NexusApp.esc(g.genre)}</td>
                                    <td><span class="badge badge-info">${NexusApp.esc(g.platform)}</span></td>
                                    <td>
                                        <div class="chip-list" style="margin:0;">
                                            ${(g.available_rooms || []).length === 0
                                                ? '<span class="chip" style="color:var(--danger);">Unassigned</span>'
                                                : g.available_rooms.map(r => `<span class="chip">${NexusApp.esc(r.name)}</span>`).join('')
                                            }
                                        </div>
                                    </td>
                                    <td>${g.play_count || 0}</td>
                                    <td><span class="badge badge-${NexusApp.esc(g.status)}">${NexusApp.esc(g.status)}</span></td>
                                    <td>
                                        <div style="display:flex; gap:6px;">
                                            <button class="btn btn-secondary btn-sm" onclick='NexusAdmin.openGameModal(${JSON.stringify(g).replace(/'/g, "&#39;")})'>Edit / Map Rooms</button>
                                            <button class="btn btn-danger btn-sm" onclick="NexusAdmin.deleteGame('${NexusApp.esc(g.id)}', '${NexusApp.esc(g.title)}')">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    openGameModal(game = null) {
        const isEdit = Boolean(game);
        const rooms = NexusApp.state.roomsState.rooms || [];
        const assignedIds = (game && game.room_ids) || [];

        NexusApp.openModal(isEdit ? 'Edit Game & Room Locations — ' + game.title : 'Add New Game to Catalog', `
            <form onsubmit="NexusAdmin.submitGameForm(event)">
                <input type="hidden" name="id" value="${NexusApp.esc(game ? game.id : '')}">
                <div class="form-group">
                    <label class="form-label">Game Title</label>
                    <input type="text" name="title" class="form-control" value="${NexusApp.esc(game ? game.title : '')}" required placeholder="e.g., Street Fighter 6">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Genre</label>
                        <input type="text" name="genre" class="form-control" value="${NexusApp.esc(game ? game.genre : 'Fighting')}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Console Platform</label>
                        <input type="text" name="platform" class="form-control" value="${NexusApp.esc(game ? game.platform : 'PlayStation 5')}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select name="status" class="form-control">
                            <option value="available" ${game && game.status === 'available' ? 'selected' : ''}>Available</option>
                            <option value="unavailable" ${game && game.status === 'unavailable' ? 'selected' : ''}>Unavailable</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Cover Image URL</label>
                    <input type="url" name="cover_url" class="form-control" value="${NexusApp.esc(game ? game.cover_url : '')}" placeholder="https://...">
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea name="description" rows="2" class="form-control">${NexusApp.esc(game ? game.description : '')}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Assign Rooms Where This Game is Installed (Check all that apply):</label>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:rgba(7,9,19,0.6); padding:12px; border-radius:8px; border:1px solid var(--border-subtle);">
                        ${rooms.map(r => `
                            <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;">
                                <input type="checkbox" name="room_ids_chk" value="${NexusApp.esc(r.id)}" ${assignedIds.includes(r.id) ? 'checked' : ''}>
                                <span>${NexusApp.esc(r.name)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">${isEdit ? 'Save Game & Room Mapping' : 'Add Game'}</button>
            </form>
        `);
    },

    async submitGameForm(e) {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        const roomIds = Array.from(form.querySelectorAll('input[name="room_ids_chk"]:checked')).map(cb => cb.value);

        try {
            await NexusApp.api('games.save', {
                id: fd.get('id'),
                title: fd.get('title'),
                genre: fd.get('genre'),
                platform: fd.get('platform'),
                status: fd.get('status'),
                cover_url: fd.get('cover_url'),
                description: fd.get('description'),
                room_ids: roomIds
            });
            NexusApp.closeModal();
            NexusApp.toast('Game and room locations saved!', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    deleteGame(gameId, title) {
        NexusApp.confirmDialog('Remove Game', `Remove "${title}" and its room mappings from the catalog?`, async () => {
            try {
                await NexusApp.api('games.delete', { game_id: gameId });
                NexusApp.toast('Game removed.', 'info');
                await NexusApp.refreshSystemState(false);
            } catch (err) {
                NexusApp.toast(err.message, 'error');
            }
        });
    },

    // =========================================================================
    // 5. CONTROLLER INVENTORY & CUSTOMER REQUESTS
    // =========================================================================
    async renderControllers(container) {
        const data = await NexusApp.api('controllers.list');
        const controllers = data.controllers || [];
        const requests = data.requests || [];

        container.innerHTML = `
            <div class="card card-neon" style="margin-bottom:24px;">
                <h3 style="margin-bottom:10px;">🔔 Customer Additional Controller Requests (${requests.length})</h3>
                ${requests.length === 0 ? `<div class="empty-state">No controller requests submitted yet.</div>` : `
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Room</th>
                                    <th>Customer</th>
                                    <th>Console Model</th>
                                    <th>Qty Requested</th>
                                    <th>Notes</th>
                                    <th>Status</th>
                                    <th>Decision</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${requests.map(r => `
                                    <tr>
                                        <td><strong>${NexusApp.esc(r.room_name)}</strong></td>
                                        <td>${NexusApp.esc(r.customer_name)}</td>
                                        <td>${NexusApp.esc(r.console)}</td>
                                        <td><strong>+${r.quantity}</strong></td>
                                        <td>${NexusApp.esc(r.notes || '—')}</td>
                                        <td><span class="badge badge-${r.status === 'approved' ? 'available' : (r.status === 'rejected' ? 'danger' : 'pending')}">${NexusApp.esc(r.status)}</span></td>
                                        <td>
                                            ${r.status === 'pending' ? `
                                                <div style="display:flex; gap:6px;">
                                                    <button class="btn btn-success btn-sm" onclick="NexusAdmin.decideControllerReq('${NexusApp.esc(r.id)}', 'approved')">Approve &amp; Assign</button>
                                                    <button class="btn btn-danger btn-sm" onclick="NexusAdmin.decideControllerReq('${NexusApp.esc(r.id)}', 'rejected')">Reject</button>
                                                </div>
                                            ` : 'Processed'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <div class="card">
                <h3 style="margin-bottom:12px;">🎮 Per-Room Controller Inventory (${controllers.length} Rooms)</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Room</th>
                                <th>Controller Type</th>
                                <th>Total</th>
                                <th>Available</th>
                                <th>In Use</th>
                                <th>Maintenance</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${controllers.map(c => `
                                <tr>
                                    <td><strong>${NexusApp.esc(c.room_name)}</strong></td>
                                    <td>${NexusApp.esc(c.console)}</td>
                                    <td><strong>${c.total_controllers}</strong></td>
                                    <td><span class="badge badge-${c.available_controllers > 0 ? 'available' : 'danger'}">${c.available_controllers} Available</span></td>
                                    <td>${c.in_use_controllers}</td>
                                    <td>${c.maintenance_controllers}</td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm" onclick='NexusAdmin.openControllerEditModal(${JSON.stringify(c).replace(/'/g, "&#39;")})'>Update Counts</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async decideControllerReq(reqId, decision) {
        try {
            await NexusApp.api('controllers.decide', { request_id: reqId, decision });
            NexusApp.toast('Controller request ' + decision + '!', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    openControllerEditModal(c) {
        NexusApp.openModal('Update Controller Inventory — ' + c.room_name, `
            <form onsubmit="NexusAdmin.submitControllerUpdate(event)">
                <input type="hidden" name="id" value="${NexusApp.esc(c.id)}">
                <div class="form-group">
                    <label class="form-label">Controller Model / Description</label>
                    <input type="text" name="console" class="form-control" value="${NexusApp.esc(c.console)}" required>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Total Controllers</label>
                        <input type="number" name="total_controllers" class="form-control" value="${c.total_controllers}" min="0" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Currently In Use</label>
                        <input type="number" name="in_use_controllers" class="form-control" value="${c.in_use_controllers}" min="0" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Under Maintenance</label>
                        <input type="number" name="maintenance_controllers" class="form-control" value="${c.maintenance_controllers}" min="0" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Save Controller Inventory</button>
            </form>
        `);
    },

    async submitControllerUpdate(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('controllers.update', {
                id: fd.get('id'),
                console: fd.get('console'),
                total_controllers: Number(fd.get('total_controllers')),
                in_use_controllers: Number(fd.get('in_use_controllers')),
                maintenance_controllers: Number(fd.get('maintenance_controllers'))
            });
            NexusApp.closeModal();
            NexusApp.toast('Controller inventory updated.', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 6. FOOD & BEVERAGE INVENTORY & AUDIT LOG
    // =========================================================================
    async renderMenuAndStock(container) {
        const [menuData, movData] = await Promise.all([
            NexusApp.api('menu.list'),
            NexusApp.api('menu.movements')
        ]);
        const items = menuData.menu_items || [];
        const movements = movData.movements || [];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                <div>
                    <h3>🍟 Food &amp; Beverage Menu &amp; Stock Control (${items.length} Items)</h3>
                    <p style="font-size:0.83rem; color:var(--text-secondary);">Low-stock warning threshold: <strong>${menuData.low_stock_threshold || 5} units</strong>. Every stock change is audited below.</p>
                </div>
                <button class="btn btn-primary" onclick="NexusAdmin.openMenuModal()">+ Add New Menu Item</button>
            </div>

            <div class="card" style="margin-bottom:24px;">
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Category</th>
                                <th>Sale Price</th>
                                <th>Stock Level</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(i => `
                                <tr>
                                    <td><strong>${NexusApp.esc(i.name)}</strong></td>
                                    <td>${NexusApp.esc(i.category)}</td>
                                    <td><strong>${NexusApp.money(i.price)}</strong></td>
                                    <td>
                                        <span class="badge ${i.stock <= 0 ? 'badge-danger' : (i.is_low_stock ? 'badge-warning' : 'badge-available')}">
                                            ${i.stock} units ${i.is_low_stock ? '(LOW)' : ''}
                                        </span>
                                    </td>
                                    <td><span class="badge ${i.is_active ? 'badge-available' : 'badge-danger'}">${i.is_active ? 'Active' : 'Deactivated'}</span></td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm" onclick='NexusAdmin.openMenuModal(${JSON.stringify(i).replace(/'/g, "&#39;")})'>Edit / Restock</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-bottom:12px;">📋 Inventory Movements Audit Trail (${movements.length})</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Item</th>
                                <th>Change</th>
                                <th>Prev &rarr; New Stock</th>
                                <th>Reason / Reference</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${movements.slice(0, 25).map(m => `
                                <tr>
                                    <td>${NexusApp.esc(String(m.created_at).slice(0, 19).replace('T', ' '))}</td>
                                    <td><strong>${NexusApp.esc(m.item_name)}</strong></td>
                                    <td>
                                        <span class="badge ${m.change_qty >= 0 ? 'badge-available' : 'badge-warning'}">
                                            ${m.change_qty >= 0 ? '+' + m.change_qty : m.change_qty}
                                        </span>
                                    </td>
                                    <td>${m.previous_stock} &rarr; <strong>${m.new_stock}</strong></td>
                                    <td>${NexusApp.esc(m.reason)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    openMenuModal(item = null) {
        const isEdit = Boolean(item);
        NexusApp.openModal(isEdit ? 'Edit / Restock — ' + item.name : 'Add Menu Item', `
            <form onsubmit="NexusAdmin.submitMenuForm(event)">
                <input type="hidden" name="id" value="${NexusApp.esc(item ? item.id : '')}">
                <div class="form-group">
                    <label class="form-label">Item Name</label>
                    <input type="text" name="name" class="form-control" value="${NexusApp.esc(item ? item.name : '')}" required>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Category</label>
                        <input type="text" name="category" class="form-control" value="${NexusApp.esc(item ? item.category : 'Snacks & Bites')}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Harga Jual (Rp)</label>
                        <input type="number" step="1000" name="price" class="form-control" value="${item ? item.price : 20000}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Current Stock (Units)</label>
                        <input type="number" name="stock" class="form-control" value="${item ? item.stock : 20}" min="0" required>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Menu Visibility</label>
                        <select name="is_active" class="form-control">
                            <option value="1" ${!item || item.is_active ? 'selected' : ''}>Active (Visible to Customers)</option>
                            <option value="0" ${item && !item.is_active ? 'selected' : ''}>Deactivated (Hidden)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Audit Reason for Stock Update</label>
                        <input type="text" name="stock_reason" class="form-control" value="Admin Manual Restock / Adjustment">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Image URL</label>
                    <input type="url" name="image_url" class="form-control" value="${NexusApp.esc(item ? item.image_url : '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea name="description" rows="2" class="form-control">${NexusApp.esc(item ? item.description : '')}</textarea>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">${isEdit ? 'Save Item & Log Stock Audit' : 'Create Menu Item'}</button>
            </form>
        `);
    },

    async submitMenuForm(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('menu.save', {
                id: fd.get('id'),
                name: fd.get('name'),
                category: fd.get('category'),
                price: Number(fd.get('price')),
                stock: Number(fd.get('stock')),
                is_active: fd.get('is_active') === '1',
                stock_reason: fd.get('stock_reason'),
                image_url: fd.get('image_url'),
                description: fd.get('description')
            });
            NexusApp.closeModal();
            NexusApp.toast('Menu item saved and stock audit logged!', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 7. ORDER MANAGEMENT
    // =========================================================================
    async renderOrders(container) {
        const res = await NexusApp.api('orders.list');
        const orders = res.orders || [];
        const statuses = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered', 'Cancelled'];

        container.innerHTML = `
            <div class="card">
                <h3 style="margin-bottom:10px;">🧾 Incoming Food &amp; Beverage Orders (${orders.length})</h3>
                <p style="font-size:0.83rem; color:var(--text-secondary); margin-bottom:14px;">Cancelling a confirmed order automatically restores its deducted stock to inventory.</p>
                ${orders.length === 0 ? `<div class="empty-state">No F&amp;B orders yet.</div>` : `
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Order ID</th>
                                    <th>Room #</th>
                                    <th>Customer</th>
                                    <th>Items Ordered</th>
                                    <th>Total</th>
                                    <th>Current Status</th>
                                    <th>Update Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orders.map(o => `
                                    <tr>
                                        <td><code>${NexusApp.esc(o.id)}</code></td>
                                        <td><span class="badge badge-info">Room ${NexusApp.esc(o.room_number || 'Counter')}</span></td>
                                        <td><strong>${NexusApp.esc(o.customer_name)}</strong></td>
                                        <td>
                                            ${(o.items || []).map(l => `<div>${l.quantity}&times; ${NexusApp.esc(l.name)}</div>`).join('')}
                                            ${o.notes ? `<div style="font-size:0.75rem; color:var(--warning);">Note: ${NexusApp.esc(o.notes)}</div>` : ''}
                                        </td>
                                        <td><strong>${NexusApp.money(o.total_amount)}</strong></td>
                                        <td><span class="badge badge-${NexusApp.esc(String(o.status).toLowerCase())}">${NexusApp.esc(o.status)}</span></td>
                                        <td>
                                            <div style="display:flex; gap:6px; align-items:center;">
                                                <select id="ord-st-${NexusApp.esc(o.id)}" class="form-control" style="padding:5px 8px; font-size:0.8rem; width:auto;">
                                                    ${statuses.map(st => `<option value="${st}" ${o.status === st ? 'selected' : ''}>${st}</option>`).join('')}
                                                </select>
                                                <button class="btn btn-primary btn-sm" onclick="NexusAdmin.updateOrderStatus('${NexusApp.esc(o.id)}')">Apply</button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;
    },

    async updateOrderStatus(orderId) {
        const sel = document.getElementById('ord-st-' + orderId);
        if (!sel) return;
        const newStatus = sel.value;
        try {
            await NexusApp.api('orders.status', { order_id: orderId, status: newStatus });
            NexusApp.toast('Order #' + orderId + ' updated to ' + newStatus, 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 8. TRANSACTIONS, EXPENSES, AND PROFIT REPORTS (+ CSV EXPORT)
    // =========================================================================
    async renderFinance(container) {
        const rep = await NexusApp.api('finance.report', null, this.financeFilter);
        const sum = rep.summary || {};
        const txs = rep.transactions || [];
        const exps = rep.expenses || [];
        const topRooms = rep.top_rooms || [];
        const topFnb = rep.best_selling_fnb || [];
        const topGames = rep.popular_games || [];

        const csvParams = new URLSearchParams({ action: 'finance.export_csv', ...this.financeFilter });

        container.innerHTML = `
            <div class="filter-bar">
                <select id="fin-period" class="form-control">
                    <option value="all" ${this.financeFilter.period === 'all' ? 'selected' : ''}>All Time</option>
                    <option value="daily" ${this.financeFilter.period === 'daily' ? 'selected' : ''}>Today (Daily Report)</option>
                    <option value="weekly" ${this.financeFilter.period === 'weekly' ? 'selected' : ''}>Last 7 Days (Weekly Report)</option>
                    <option value="monthly" ${this.financeFilter.period === 'monthly' ? 'selected' : ''}>Last 30 Days (Monthly Report)</option>
                </select>
                <input type="date" id="fin-start" class="form-control" value="${NexusApp.esc(this.financeFilter.start_date)}" title="Start Date">
                <input type="date" id="fin-end" class="form-control" value="${NexusApp.esc(this.financeFilter.end_date)}" title="End Date">
                <select id="fin-demo" class="form-control">
                    <option value="true" ${this.financeFilter.include_demo === 'true' ? 'selected' : ''}>All Records (Live + Labeled Demo Seed)</option>
                    <option value="false" ${this.financeFilter.include_demo === 'false' ? 'selected' : ''}>Strictly Live Transactions Only (${sum.live_transactions_count || 0})</option>
                </select>
                <button class="btn btn-primary btn-sm" onclick="NexusAdmin.applyFinanceFilter()">Apply Filter</button>
                <a class="btn btn-success btn-sm" href="/api.php?${csvParams.toString()}" target="_blank">⬇ Export CSV Report</a>
            </div>

            <div class="grid-4">
                <div class="card stat-card">
                    <span class="stat-label">Rental Revenue</span>
                    <div class="stat-value" style="color:var(--neon-blue);">${NexusApp.money(sum.rental_revenue)}</div>
                    <span class="stat-sub">${sum.completed_sessions_count || 0} Completed Sessions • ${sum.total_bookings_count || 0} Bookings</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">F&amp;B Sales Revenue</span>
                    <div class="stat-value" style="color:#e9d5ff;">${NexusApp.money(sum.fnb_revenue)}</div>
                    <span class="stat-sub">Confirmed Kitchen &amp; Drink Orders</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Total Gross Revenue</span>
                    <div class="stat-value">${NexusApp.money(sum.total_revenue)}</div>
                    <span class="stat-sub">Rental Income + F&amp;B Sales</span>
                </div>
                <div class="card stat-card" style="border-color:rgba(16,185,129,0.45);">
                    <span class="stat-label">Estimated Net Profit</span>
                    <div class="stat-value" style="color:${sum.estimated_profit >= 0 ? '#34d399' : '#f87171'};">${NexusApp.money(sum.estimated_profit)}</div>
                    <span class="stat-sub">Revenue (${NexusApp.money(sum.total_revenue)}) &minus; Costs (${NexusApp.money(sum.operating_expenses)})</span>
                </div>
            </div>

            <div class="grid-3">
                <div class="card">
                    <h4 style="margin-bottom:10px;">🏆 Most Frequently Used Rooms</h4>
                    ${topRooms.map(r => `
                        <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border-subtle); font-size:0.85rem;">
                            <span>${NexusApp.esc(r.room_name)}</span>
                            <strong>${r.usage_count} sessions</strong>
                        </div>
                    `).join('')}
                </div>
                <div class="card">
                    <h4 style="margin-bottom:10px;">🍔 Best-Selling Food &amp; Drinks</h4>
                    ${topFnb.length === 0 ? `<div class="empty-state">No F&amp;B sales in range.</div>` : topFnb.map(i => `
                        <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border-subtle); font-size:0.85rem;">
                            <span>${NexusApp.esc(i.name)} (${i.qty_sold} sold)</span>
                            <strong>${NexusApp.money(i.revenue)}</strong>
                        </div>
                    `).join('')}
                </div>
                <div class="card">
                    <h4 style="margin-bottom:10px;">🕹️ Most Popular Games</h4>
                    ${topGames.map(g => `
                        <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--border-subtle); font-size:0.85rem;">
                            <span>${NexusApp.esc(g.title)}</span>
                            <strong>${g.play_count} plays</strong>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="grid-2">
                <div class="card">
                    <h3 style="margin-bottom:12px;">💵 Recorded Revenue Transactions (${txs.length})</h3>
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Stream</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${txs.map(t => `
                                    <tr>
                                        <td>${NexusApp.esc(t.transaction_date || String(t.created_at).slice(0, 10))}</td>
                                        <td><span class="badge badge-${t.type === 'fnb' ? 'vip' : 'info'}">${NexusApp.esc(t.type)}</span></td>
                                        <td>${NexusApp.esc(t.description)}</td>
                                        <td><strong style="color:#34d399;">+${NexusApp.money(t.amount)}</strong></td>
                                        <td><span class="badge ${t.is_demo ? 'badge-warning' : 'badge-available'}">${t.is_demo ? 'Demo Seed' : 'Live'}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <h3>📉 Operating Costs &amp; Expenses (${NexusApp.money(sum.operating_expenses)})</h3>
                        <button class="btn btn-primary btn-sm" onclick="NexusAdmin.openExpenseModal()">+ Record Expense</button>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th>Cost</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${exps.map(ex => `
                                    <tr>
                                        <td>${NexusApp.esc(ex.expense_date)}</td>
                                        <td>${NexusApp.esc(ex.category)}</td>
                                        <td>${NexusApp.esc(ex.description)}</td>
                                        <td><strong style="color:#f87171;">-${NexusApp.money(ex.amount)}</strong></td>
                                        <td><button class="btn btn-danger btn-sm" onclick="NexusAdmin.deleteExpense('${NexusApp.esc(ex.id)}')">Delete</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    applyFinanceFilter() {
        this.financeFilter = {
            period: document.getElementById('fin-period').value,
            start_date: document.getElementById('fin-start').value,
            end_date: document.getElementById('fin-end').value,
            include_demo: document.getElementById('fin-demo').value
        };
        this.renderFinance(document.getElementById('app-main-view'));
    },

    openExpenseModal() {
        const today = new Date().toISOString().slice(0, 10);
        NexusApp.openModal('Record Operating Cost / Expense', `
            <form onsubmit="NexusAdmin.submitExpenseForm(event)">
                <div class="form-group">
                    <label class="form-label">Expense Category</label>
                    <select name="category" class="form-control">
                        <option value="Utilities & Electricity">Utilities &amp; Electricity</option>
                        <option value="F&B Restock">F&amp;B Inventory Restock</option>
                        <option value="Hardware & Controller Maintenance">Hardware &amp; Controller Maintenance</option>
                        <option value="Staff Wages">Staff &amp; Host Wages</option>
                        <option value="Game Licenses">New Game Licenses</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <input type="text" name="description" class="form-control" required placeholder="e.g., Monthly Fiber Internet & Power Bill">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label class="form-label">Nominal Biaya (Rp)</label>
                        <input type="number" step="1000" min="1000" name="amount" class="form-control" required placeholder="50000">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Expense Date</label>
                        <input type="date" name="expense_date" class="form-control" value="${today}" required>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Save Operating Expense</button>
            </form>
        `);
    },

    async submitExpenseForm(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('finance.add_expense', {
                category: fd.get('category'),
                description: fd.get('description'),
                amount: Number(fd.get('amount')),
                expense_date: fd.get('expense_date')
            });
            NexusApp.closeModal();
            NexusApp.toast('Operating expense recorded!', 'success');
            await this.renderFinance(document.getElementById('app-main-view'));
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    async deleteExpense(expenseId) {
        NexusApp.confirmDialog('Delete Expense Record', 'Remove this operating expense from financial reports?', async () => {
            try {
                await NexusApp.api('finance.delete_expense', { expense_id: expenseId });
                NexusApp.toast('Expense removed.', 'info');
                await this.renderFinance(document.getElementById('app-main-view'));
            } catch (err) {
                NexusApp.toast(err.message, 'error');
            }
        });
    },

    // =========================================================================
    // 9. CUSTOMER SUPPORT (Admin Inbox & Live Reply)
    // =========================================================================
    async renderSupport(container) {
        const state = await NexusApp.api('support.state', null, this.activeSupportConvId ? { conversation_id: this.activeSupportConvId } : {});
        const convs = state.conversations || [];
        const activeId = state.active_conversation_id;
        this.activeSupportConvId = activeId;
        const messages = state.messages || [];
        const online = Boolean(state.admin_online);

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                <div>
                    <h3>🎧 Human Admin Support Inbox (${convs.length} Threads)</h3>
                    <p style="font-size:0.83rem; color:var(--text-secondary);">Respond to customer inquiries in real time. Conversations are automatically linked to the customer's room session.</p>
                </div>
                <button class="btn ${online ? 'btn-success' : 'btn-warning'}" onclick="NexusAdmin.toggleSupportOnline(${!online})">
                    ${online ? '🟢 Status: Admin Online (Click to set Away)' : '🟡 Status: Admin Away (Click to set Online)'}
                </button>
            </div>

            <div class="grid-2" style="grid-template-columns: 1fr 2fr;">
                <div class="card">
                    <h4 style="margin-bottom:12px;">Customer Conversations</h4>
                    ${convs.length === 0 ? `<div class="empty-state">No support threads yet.</div>` : `
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${convs.map(c => `
                                <div onclick="NexusAdmin.selectSupportConv('${NexusApp.esc(c.id)}')" style="padding:12px; border-radius:8px; cursor:pointer; background:${c.id === activeId ? 'rgba(0,240,255,0.12)' : 'rgba(7,9,19,0.5)'}; border:1px solid ${c.id === activeId ? 'var(--neon-blue)' : 'var(--border-subtle)'};">
                                    <div style="display:flex; justify-content:space-between; align-items:center;">
                                        <strong>${NexusApp.esc(c.customer_name)}</strong>
                                        ${c.unread_admin_count > 0 ? `<span class="nav-badge danger">${c.unread_admin_count} new</span>` : ''}
                                    </div>
                                    <div style="font-size:0.75rem; color:var(--neon-blue); margin:2px 0;">
                                        ${c.room_number ? `📍 Room ${NexusApp.esc(c.room_number)}` : 'No active room'}
                                    </div>
                                    <div style="font-size:0.8rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${NexusApp.esc(c.last_message || '')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>

                <div class="chat-window">
                    <div class="chat-header">
                        <strong>Conversation Thread ${activeId ? `(ID: ${NexusApp.esc(activeId)})` : ''}</strong>
                        <button class="btn btn-secondary btn-sm" onclick="NexusAdmin.renderSupport(document.getElementById('app-main-view'))">&#8635; Refresh</button>
                    </div>
                    <div class="chat-messages" id="admin-support-messages">
                        ${messages.length === 0 ? `<div class="empty-state">Select a conversation to view messages.</div>` : messages.map(m => {
                            const isAdminMsg = m.sender_role === 'admin';
                            return `
                                <div class="chat-bubble ${isAdminMsg ? 'outgoing' : 'incoming'}">
                                    <div style="font-weight:700; font-size:0.75rem; margin-bottom:3px;">
                                        ${NexusApp.esc(m.sender_name)} (${NexusApp.esc(m.sender_role.toUpperCase())})
                                    </div>
                                    <div>${NexusApp.esc(m.message)}</div>
                                    <div class="chat-meta">${NexusApp.esc(String(m.created_at).slice(0, 16).replace('T', ' '))} • ${m.is_read ? '✓✓ Read' : '✓ Sent'}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${activeId ? `
                        <form class="chat-input-bar" onsubmit="NexusAdmin.sendAdminSupportReply(event)">
                            <input type="hidden" id="admin-support-conv-id" value="${NexusApp.esc(activeId)}">
                            <input type="text" id="admin-support-input" class="form-control" placeholder="Write official admin response to customer..." required>
                            <button type="submit" class="btn btn-primary">Send Reply</button>
                        </form>
                    ` : ''}
                </div>
            </div>
        `;
        const box = document.getElementById('admin-support-messages');
        if (box) box.scrollTop = box.scrollHeight;
    },

    selectSupportConv(convId) {
        this.activeSupportConvId = convId;
        this.renderSupport(document.getElementById('app-main-view'));
    },

    async sendAdminSupportReply(e) {
        e.preventDefault();
        const convId = document.getElementById('admin-support-conv-id').value;
        const input = document.getElementById('admin-support-input');
        const msg = input.value.trim();
        if (!msg || !convId) return;
        input.value = '';
        try {
            await NexusApp.api('support.send', { conversation_id: convId, message: msg });
            NexusApp.toast('Reply sent to customer.', 'success');
            await this.renderSupport(document.getElementById('app-main-view'));
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    async toggleSupportOnline(online) {
        try {
            await NexusApp.api('support.toggle_online', { admin_online: online });
            NexusApp.toast('Support availability status updated.', 'success');
            await this.renderSupport(document.getElementById('app-main-view'));
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 10. RATINGS & FEEDBACK MANAGEMENT
    // =========================================================================
    async renderFeedbackAdmin(container) {
        const fbData = await NexusApp.api('feedback.list');
        const list = fbData.feedback_list || [];
        const cats = fbData.category_counts || {};

        container.innerHTML = `
            <div class="grid-4">
                <div class="card stat-card">
                    <span class="stat-label">Average Rating</span>
                    <div class="stat-value" style="color:#fbbf24;">★ ${Number(fbData.average_rating || 5).toFixed(2)}</div>
                    <span class="stat-sub">Out of 5.00 stars</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Reviews</span>
                    <div class="stat-value">${cats.review || 0}</div>
                    <span class="stat-sub">Public Session Reviews</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Complaints</span>
                    <div class="stat-value" style="color:#f87171;">${cats.complaint || 0}</div>
                    <span class="stat-sub">Private Customer Escalations</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Suggestions</span>
                    <div class="stat-value" style="color:var(--neon-blue);">${cats.suggestion || 0}</div>
                    <span class="stat-sub">Feature &amp; Game Ideas</span>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-bottom:12px;">🌟 Customer Feedback, Complaints &amp; Review Moderation (${list.length})</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Room / Session</th>
                                <th>Category</th>
                                <th>Rating</th>
                                <th>Comment &amp; Admin Reply</th>
                                <th>Correction</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${list.map(f => `
                                <tr>
                                    <td><strong>${NexusApp.esc(f.customer_display_name)}</strong></td>
                                    <td>${NexusApp.esc(f.room_name || 'General')}<div style="font-size:0.72rem; color:var(--text-secondary);">${NexusApp.esc(f.session_id || '')}</div></td>
                                    <td><span class="badge badge-${f.category === 'complaint' ? 'danger' : (f.category === 'suggestion' ? 'info' : 'available')}">${NexusApp.esc(f.category)}</span></td>
                                    <td style="color:#fbbf24; font-weight:700;">${'★'.repeat(Number(f.rating || 5))}</td>
                                    <td>
                                        <div>"${NexusApp.esc(f.comment)}"</div>
                                        ${f.admin_response ? `<div style="font-size:0.78rem; color:var(--neon-blue); margin-top:4px;">Reply: ${NexusApp.esc(f.admin_response)}</div>` : ''}
                                    </td>
                                    <td>
                                        <span class="badge ${f.allow_resubmit ? 'badge-warning' : 'badge-secondary'}">${f.allow_resubmit ? 'Resubmit Allowed' : 'Locked'}</span>
                                    </td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm" onclick='NexusAdmin.openFeedbackReplyModal(${JSON.stringify(f).replace(/'/g, "&#39;")})'>Respond / Unlock</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    openFeedbackReplyModal(f) {
        NexusApp.openModal('Respond to Feedback — ' + f.customer_display_name, `
            <form onsubmit="NexusAdmin.submitFeedbackReply(event)">
                <input type="hidden" name="feedback_id" value="${NexusApp.esc(f.id)}">
                <p style="font-size:0.86rem; background:rgba(7,9,19,0.6); padding:10px; border-radius:8px; margin-bottom:14px;">
                    "${NexusApp.esc(f.comment)}"
                </p>
                <div class="form-group">
                    <label class="form-label">Official Admin Response</label>
                    <textarea name="admin_response" rows="3" class="form-control" required>${NexusApp.esc(f.admin_response || '')}</textarea>
                </div>
                <div class="form-group">
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.86rem; cursor:pointer;">
                        <input type="checkbox" name="allow_resubmit" value="1" ${f.allow_resubmit ? 'checked' : ''}>
                        <span>Approve customer to edit/resubmit their review for this session</span>
                    </label>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Save Response</button>
            </form>
        `);
    },

    async submitFeedbackReply(e) {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        try {
            await NexusApp.api('feedback.respond', {
                feedback_id: fd.get('feedback_id'),
                admin_response: fd.get('admin_response'),
                allow_resubmit: form.querySelector('input[name="allow_resubmit"]').checked
            });
            NexusApp.closeModal();
            NexusApp.toast('Feedback response saved.', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 11. USER MANAGEMENT
    // =========================================================================
    async renderUsers(container) {
        const res = await NexusApp.api('users.list');
        const users = res.users || [];

        container.innerHTML = `
            <div class="card">
                <h3 style="margin-bottom:12px;">👥 Registered Users &amp; Role Authorization (${users.length})</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>User ID</th>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(u => `
                                <tr>
                                    <td><code>${NexusApp.esc(u.id)}</code></td>
                                    <td><strong>${NexusApp.esc(u.name)}</strong></td>
                                    <td>${NexusApp.esc(u.email)}</td>
                                    <td>${NexusApp.esc(u.phone || '—')}</td>
                                    <td><span class="badge ${u.role === 'admin' ? 'badge-vip' : 'badge-info'}">${NexusApp.esc(u.role)}</span></td>
                                    <td><span class="badge ${u.status === 'active' ? 'badge-available' : 'badge-danger'}">${NexusApp.esc(u.status || 'active')}</span></td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm" onclick='NexusAdmin.openUserEditModal(${JSON.stringify(u).replace(/'/g, "&#39;")})'>Edit Role / Status</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    openUserEditModal(u) {
        NexusApp.openModal('Edit User — ' + u.name, `
            <form onsubmit="NexusAdmin.submitUserUpdate(event)">
                <input type="hidden" name="user_id" value="${NexusApp.esc(u.id)}">
                <div class="form-group">
                    <label class="form-label">Full Name</label>
                    <input type="text" name="name" class="form-control" value="${NexusApp.esc(u.name)}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Role Permission</label>
                    <select name="role" class="form-control">
                        <option value="customer" ${u.role === 'customer' ? 'selected' : ''}>Customer</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Account Status</label>
                    <select name="status" class="form-control">
                        <option value="active" ${u.status !== 'suspended' ? 'selected' : ''}>Active</option>
                        <option value="suspended" ${u.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">Update User</button>
            </form>
        `);
    },

    async submitUserUpdate(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('users.update', Object.fromEntries(fd.entries()));
            NexusApp.closeModal();
            NexusApp.toast('User updated.', 'success');
            await this.renderUsers(document.getElementById('app-main-view'));
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    },

    // =========================================================================
    // 12. BUSINESS SETTINGS & FIREBASE DIAGNOSTICS
    // =========================================================================
    renderSettings(container) {
        const s = NexusApp.state.settings || {};
        const db = NexusApp.state.dbStatus || {};
        const durations = (s.allowed_durations_hours || [1, 2, 3, 4, 6, 8]).join(', ');

        container.innerHTML = `
            <div class="grid-2">
                <div class="card card-neon">
                    <h3 style="margin-bottom:12px;">⚙️ Configurable Business Rates &amp; Rules</h3>
                    <form onsubmit="NexusAdmin.submitSettingsForm(event)">
                        <div class="form-group">
                            <label class="form-label">Business Name</label>
                            <input type="text" name="business_name" class="form-control" value="${NexusApp.esc(s.business_name || 'Nexus Arena Gaming & Rental')}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Opening Hours</label>
                            <input type="text" name="opening_hours" class="form-control" value="${NexusApp.esc(s.opening_hours || '10:00 AM - 02:00 AM Daily')}" required>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label class="form-label">Tarif Default Ruang Reguler (Rp/jam)</label>
                                <input type="number" step="1000" name="regular_default_rate" class="form-control" value="${s.regular_default_rate || 20000}" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Tarif Default Ruang VIP (Rp/jam)</label>
                                <input type="number" step="1000" name="vip_default_rate" class="form-control" value="${s.vip_default_rate || 50000}" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Allowed Booking Durations in Hours (comma-separated)</label>
                            <input type="text" name="allowed_durations_hours" class="form-control" value="${NexusApp.esc(durations)}" required>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label class="form-label">Low-Stock Warning Threshold (Units)</label>
                                <input type="number" name="low_stock_threshold" class="form-control" value="${s.low_stock_threshold || 5}" min="1" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Low Session Time Warning (Minutes)</label>
                                <input type="number" name="low_time_warning_minutes" class="form-control" value="${s.low_time_warning_minutes || 15}" min="1" required>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%;">Save Business Settings</button>
                    </form>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:12px;">🔥 Firebase &amp; Firestore Architecture Status</h3>
                    <div style="background:rgba(7,9,19,0.65); padding:16px; border-radius:10px; border:1px solid var(--border-color); margin-bottom:14px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span style="color:var(--text-secondary);">Active Persistence Driver:</span>
                            <strong style="color:var(--neon-blue);">${NexusApp.esc(db.label || db.driver)}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span style="color:var(--text-secondary);">Cloud Firestore Mode:</span>
                            <span class="badge ${db.cloud_connected ? 'badge-available' : 'badge-warning'}">
                                ${db.cloud_connected ? 'Cloud Firestore REST Connected' : 'Local Firestore Engine (Configure .env for Cloud)'}
                            </span>
                        </div>
                        <div style="font-size:0.82rem; color:var(--text-secondary); margin-top:10px;">
                            <strong>Active Firestore Collections (${(db.collections || []).length}):</strong>
                            <div class="chip-list" style="margin-top:6px;">
                                ${(db.collections || []).map(c => `<span class="chip">${NexusApp.esc(c)}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <p style="font-size:0.83rem; color:var(--text-secondary);">
                        To switch from the Local Firestore ACID Engine to live Google Cloud Firestore &amp; Firebase Authentication, set <code>FIREBASE_PROJECT_ID</code>, <code>FIREBASE_API_KEY</code>, and <code>FIREBASE_SERVICE_ACCOUNT_PATH</code> in your <code>.env</code> file as documented in <code>README.md</code> and <code>docs/FIREBASE_SETUP.md</code>.
                    </p>
                </div>
            </div>
        `;
    },

    async submitSettingsForm(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await NexusApp.api('settings.save', Object.fromEntries(fd.entries()));
            NexusApp.toast('Business settings saved!', 'success');
            await NexusApp.refreshSystemState(false);
        } catch (err) {
            NexusApp.toast(err.message, 'error');
        }
    }
};
