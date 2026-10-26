<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Database\FirestoreInterface;
use RuntimeException;

class RoomQueueService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    public function getSettings(): array
    {
        return $this->db->getDocument('settings', 'business_config') ?? [
            'regular_default_rate' => 20000,
            'vip_default_rate' => 50000,
            'allowed_durations_hours' => [1, 2, 3, 4, 6, 8],
            'low_stock_threshold' => 5,
            'low_time_warning_minutes' => 15,
            'opening_hours' => '10:00 - 02:00 WIB (Setiap Hari)',
            'admin_online' => true,
        ];
    }

    /**
     * Synchronizes session timers against the authoritative server clock.
     * Marks sessions whose end_timestamp <= time() as 'expired' and alerts the admin,
     * WITHOUT automatically terminating paid sessions.
     */
    public function syncSessionTimers(): array
    {
        $now = time();
        $settings = $this->getSettings();
        $warnSeconds = ((int)($settings['low_time_warning_minutes'] ?? 15)) * 60;

        $sessions = $this->db->queryDocuments('sessions');
        $warnings = [];
        $expiredList = [];

        foreach ($sessions as $sess) {
            $status = $sess['status'] ?? '';
            if (!in_array($status, ['active', 'expired'], true)) {
                continue;
            }
            $endTs = (int)($sess['end_timestamp'] ?? 0);
            $remaining = $endTs - $now;

            if ($remaining <= 0 && $status === 'active') {
                $sess = $this->db->updateDocument('sessions', $sess['id'], [
                    'status' => 'expired',
                    'expired_at' => date('Y-m-d\TH:i:sP', $now),
                ]) ?? $sess;

                // Create admin notification once when session expires
                $notifId = 'notif_exp_' . $sess['id'] . '_' . $endTs;
                if ($this->db->getDocument('notifications', $notifId) === null) {
                    $this->db->setDocument('notifications', $notifId, [
                        'id' => $notifId,
                        'user_id' => $sess['user_id'] ?? '',
                        'role_target' => 'admin',
                        'title' => 'Session Expired: ' . ($sess['room_name'] ?? $sess['room_id']),
                        'message' => sprintf(
                            'Paid session for %s in %s has reached its scheduled end time. Please extend or complete the session.',
                            $sess['customer_name'] ?? 'Customer',
                            $sess['room_name'] ?? $sess['room_id']
                        ),
                        'type' => 'warning',
                        'is_read' => false,
                    ], false);
                }
            }

            if (($sess['status'] ?? '') === 'expired' || $remaining <= 0) {
                $expiredList[] = $sess;
            } elseif ($remaining <= $warnSeconds) {
                $warnings[] = $sess;
            }
        }

        return [
            'server_timestamp' => $now,
            'server_time_iso' => date('Y-m-d\TH:i:sP', $now),
            'low_time_warnings' => $warnings,
            'expired_sessions' => $expiredList,
        ];
    }

    /**
     * Returns enriched rooms with games mapped to each room, controller counts,
     * and live session timer calculation.
     */
    public function getAllRoomsEnriched(?array $currentUser = null): array
    {
        $this->syncSessionTimers();
        $now = time();
        $settings = $this->getSettings();
        $warnSeconds = ((int)($settings['low_time_warning_minutes'] ?? 15)) * 60;

        $rooms = $this->db->queryDocuments('rooms', [], 'room_number', 'ASC');
        $games = $this->db->queryDocuments('games');
        $gamesById = [];
        foreach ($games as $g) {
            $gamesById[$g['id']] = $g;
        }

        $mappings = $this->db->queryDocuments('room_games');
        $roomGamesMap = [];
        foreach ($mappings as $m) {
            $rId = $m['room_id'] ?? '';
            $gId = $m['game_id'] ?? '';
            if (isset($gamesById[$gId]) && ($gamesById[$gId]['status'] ?? 'available') === 'available') {
                $roomGamesMap[$rId][] = [
                    'id' => $gId,
                    'title' => $gamesById[$gId]['title'],
                    'genre' => $gamesById[$gId]['genre'],
                    'platform' => $gamesById[$gId]['platform'],
                ];
            }
        }

        $controllers = $this->db->queryDocuments('controllers');
        $controllersByRoom = [];
        foreach ($controllers as $c) {
            $controllersByRoom[$c['room_id']] = $c;
        }

        $sessions = $this->db->queryDocuments('sessions');
        $activeSessionsByRoom = [];
        foreach ($sessions as $s) {
            if (in_array($s['status'] ?? '', ['active', 'expired'], true)) {
                $activeSessionsByRoom[$s['room_id']] = $s;
            }
        }

        $isAdmin = ($currentUser['role'] ?? '') === 'admin';
        $currentUserId = $currentUser['id'] ?? null;

        $enriched = [];
        $regularTotal = 0;
        $regularAvailable = 0;

        foreach ($rooms as $room) {
            $rId = $room['id'];
            $ctrl = $controllersByRoom[$rId] ?? [
                'total_controllers' => 0,
                'available_controllers' => 0,
                'in_use_controllers' => 0,
                'maintenance_controllers' => 0,
                'console' => implode(', ', $room['consoles'] ?? []),
            ];

            $session = $activeSessionsByRoom[$rId] ?? null;
            $sessionData = null;

            if ($session !== null && ($room['status'] ?? '') === 'occupied') {
                $endTs = (int)($session['end_timestamp'] ?? $now);
                $startTs = (int)($session['start_timestamp'] ?? $now);
                $remainingSec = max(0, $endTs - $now);
                $overdueSec = $now > $endTs ? ($now - $endTs) : 0;
                $isOwnSession = $currentUserId !== null && ($session['user_id'] ?? '') === $currentUserId;

                $sessionData = [
                    'id' => $session['id'],
                    'status' => $remainingSec <= 0 ? 'expired' : $session['status'],
                    'start_time' => $session['start_time'],
                    'scheduled_end_time' => $session['scheduled_end_time'],
                    'start_timestamp' => $startTs,
                    'end_timestamp' => $endTs,
                    'remaining_seconds' => $remainingSec,
                    'overdue_seconds' => $overdueSec,
                    'is_low_time' => $remainingSec > 0 && $remainingSec <= $warnSeconds,
                    'is_expired' => $remainingSec <= 0,
                    'duration_hours' => $session['duration_hours'] ?? 1,
                    'game_title' => $session['game_title'] ?? 'Console Session',
                    'controllers_assigned' => $session['controllers_assigned'] ?? 1,
                    'is_own_session' => $isOwnSession,
                    'customer_name' => ($isAdmin || $isOwnSession)
                        ? ($session['customer_name'] ?? 'Customer')
                        : 'Occupied Player',
                    'user_id' => ($isAdmin || $isOwnSession) ? ($session['user_id'] ?? null) : null,
                    'total_amount' => ($isAdmin || $isOwnSession) ? ($session['total_amount'] ?? 0) : null,
                ];
            }

            if (($room['type'] ?? 'regular') === 'regular') {
                $regularTotal++;
                if (($room['status'] ?? '') === 'available') {
                    $regularAvailable++;
                }
            }

            $room['available_games'] = $roomGamesMap[$rId] ?? [];
            $room['controller_inventory'] = $ctrl;
            $room['available_controllers'] = (int)($ctrl['available_controllers'] ?? 0);
            $room['total_controllers'] = (int)($ctrl['total_controllers'] ?? 0);
            $room['current_session'] = $sessionData;
            $enriched[] = $room;
        }

        $queueList = $this->getQueueList();

        return [
            'server_timestamp' => $now,
            'server_time_iso' => date('Y-m-d\TH:i:sP', $now),
            'all_regular_occupied' => $regularTotal > 0 && $regularAvailable === 0,
            'regular_total' => $regularTotal,
            'regular_available' => $regularAvailable,
            'waiting_queue_count' => count(array_filter($queueList, static fn($q) => in_array($q['status'] ?? '', ['waiting', 'notified'], true))),
            'rooms' => $enriched,
            'queue' => $queueList,
        ];
    }

    public function getQueueList(): array
    {
        $queues = $this->db->queryDocuments('queues', [], 'created_at', 'ASC');
        $active = [];
        $pos = 1;
        foreach ($queues as $q) {
            if (in_array($q['status'] ?? '', ['waiting', 'notified'], true)) {
                $q['position'] = $pos++;
                $active[] = $q;
            }
        }
        return $active;
    }

    public function joinQueue(array $user, array $input): array
    {
        $preferredType = strtolower(trim((string)($input['preferred_room_type'] ?? 'regular')));
        $preferredConsole = trim((string)($input['preferred_console'] ?? 'Any Console'));
        $partySize = max(1, min(8, (int)($input['party_size'] ?? 2)));
        $requestedHours = max(1, min(8, (int)($input['requested_hours'] ?? 2)));
        $notes = trim((string)($input['notes'] ?? ''));

        if (!in_array($preferredType, ['regular', 'vip'], true)) {
            $preferredType = 'regular';
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($user, $preferredType, $preferredConsole, $partySize, $requestedHours, $notes) {
            $existing = $tx->queryDocuments('queues', [
                ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
            ]);
            foreach ($existing as $entry) {
                if (in_array($entry['status'] ?? '', ['waiting', 'notified'], true)) {
                    throw new InvalidArgumentException('You are already in the active waiting queue (Position #' . ($entry['position'] ?? 1) . ').');
                }
            }

            $allWaiting = $tx->queryDocuments('queues');
            $waitingCount = 0;
            foreach ($allWaiting as $w) {
                if (in_array($w['status'] ?? '', ['waiting', 'notified'], true)) {
                    $waitingCount++;
                }
            }

            $queueDoc = $tx->createDocument('queues', [
                'user_id' => $user['id'],
                'customer_name' => $user['name'],
                'preferred_room_type' => $preferredType,
                'preferred_console' => $preferredConsole,
                'party_size' => $partySize,
                'requested_hours' => $requestedHours,
                'status' => 'waiting',
                'position' => $waitingCount + 1,
                'assigned_room_id' => null,
                'notes' => $notes,
            ]);

            return $queueDoc;
        });
    }

    public function leaveOrCancelQueue(string $queueId, array $actor): array
    {
        $q = $this->db->getDocument('queues', $queueId);
        if (!$q) {
            throw new InvalidArgumentException('Queue entry not found.');
        }
        $isAdmin = ($actor['role'] ?? '') === 'admin';
        if (!$isAdmin && ($q['user_id'] ?? '') !== ($actor['id'] ?? '')) {
            throw new RuntimeException('You can only cancel your own queue entry.');
        }
        return $this->db->updateDocument('queues', $queueId, [
            'status' => 'cancelled',
        ]) ?? $q;
    }

    /**
     * Admin: Save (create or update) a gaming room.
     */
    public function saveRoom(array $input): array
    {
        $roomId = trim((string)($input['id'] ?? ''));
        $roomNumber = trim((string)($input['room_number'] ?? ''));
        $name = trim((string)($input['name'] ?? ''));
        $type = strtolower(trim((string)($input['type'] ?? 'regular')));
        $status = strtolower(trim((string)($input['status'] ?? 'available')));
        $rate = (float)($input['rate_per_hour'] ?? 20000);
        $maxPlayers = max(1, (int)($input['max_players'] ?? 4));
        $description = trim((string)($input['description'] ?? ''));

        if ($roomNumber === '' || $name === '') {
            throw new InvalidArgumentException('Room number and room name are required.');
        }
        if (!in_array($type, ['regular', 'vip'], true)) {
            throw new InvalidArgumentException('Invalid room type. Must be regular or vip.');
        }
        if (!in_array($status, ['available', 'occupied', 'reserved', 'maintenance', 'unavailable'], true)) {
            throw new InvalidArgumentException('Invalid room status.');
        }
        if ($rate <= 0) {
            throw new InvalidArgumentException('Hourly rate must be greater than zero.');
        }

        $consoles = $input['consoles'] ?? ['PlayStation 5'];
        if (is_string($consoles)) {
            $consoles = array_values(array_filter(array_map('trim', explode(',', $consoles))));
        }
        $facilities = $input['facilities'] ?? [];
        if (is_string($facilities)) {
            $facilities = array_values(array_filter(array_map('trim', explode(',', $facilities))));
        }

        if ($roomId === '') {
            $roomId = 'room_' . preg_replace('/[^a-z0-9]+/i', '_', strtolower($roomNumber));
        }

        $existing = $this->db->getDocument('rooms', $roomId);
        // Prevent setting an occupied room with an active session to available without ending the session
        if ($existing && ($existing['status'] ?? '') === 'occupied' && !empty($existing['current_session_id']) && $status !== 'occupied') {
            $activeSess = $this->db->getDocument('sessions', (string)$existing['current_session_id']);
            if ($activeSess && in_array($activeSess['status'] ?? '', ['active', 'expired'], true)) {
                throw new InvalidArgumentException('Cannot change room status while a session is active. End or cancel the session first.');
            }
        }

        $roomData = [
            'id' => $roomId,
            'room_number' => $roomNumber,
            'name' => $name,
            'type' => $type,
            'status' => $status,
            'consoles' => $consoles,
            'rate_per_hour' => round($rate, 2),
            'max_players' => $maxPlayers,
            'facilities' => $facilities,
            'current_session_id' => $existing['current_session_id'] ?? null,
            'description' => $description,
        ];

        $saved = $this->db->setDocument('rooms', $roomId, $roomData, true);

        // Ensure controller inventory record exists for this room
        $ctrlId = 'ctrl_' . $roomId;
        if ($this->db->getDocument('controllers', $ctrlId) === null) {
            $this->db->setDocument('controllers', $ctrlId, [
                'id' => $ctrlId,
                'room_id' => $roomId,
                'room_name' => $name,
                'console' => implode(', ', $consoles),
                'total_controllers' => 4,
                'available_controllers' => 4,
                'in_use_controllers' => 0,
                'maintenance_controllers' => 0,
            ], false);
        }

        return $saved;
    }

    /**
     * Admin: Atomically start a new rental session in a room.
     */
    public function startSession(array $input): array
    {
        $roomId = trim((string)($input['room_id'] ?? ''));
        $userId = trim((string)($input['user_id'] ?? ''));
        $customerName = trim((string)($input['customer_name'] ?? 'Walk-In Gamer'));
        $durationHours = (float)($input['duration_hours'] ?? 1);
        $controllersCount = max(1, (int)($input['controllers_count'] ?? 2));
        $gameId = trim((string)($input['game_id'] ?? ''));
        $paymentMethod = trim((string)($input['payment_method'] ?? 'Cash / Counter'));
        $queueId = trim((string)($input['queue_id'] ?? ''));
        $bookingId = trim((string)($input['booking_id'] ?? ''));

        if ($roomId === '') {
            throw new InvalidArgumentException('Room ID is required to start a session.');
        }
        if ($durationHours <= 0 || $durationHours > 24) {
            throw new InvalidArgumentException('Duration must be between 0.5 and 24 hours.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use (
            $roomId,
            $userId,
            $customerName,
            $durationHours,
            $controllersCount,
            $gameId,
            $paymentMethod,
            $queueId,
            $bookingId
        ) {
            $room = $tx->getDocument('rooms', $roomId);
            if (!$room) {
                throw new InvalidArgumentException('Selected room does not exist.');
            }

            if (!in_array($room['status'] ?? '', ['available', 'reserved'], true)) {
                throw new RuntimeException('Room "' . ($room['name'] ?? $roomId) . '" is currently ' . ($room['status'] ?? 'unavailable') . ' and cannot start a new session.');
            }

            // Double-check no active session already exists for this room
            $existingSessions = $tx->queryDocuments('sessions', [
                ['field' => 'room_id', 'op' => '==', 'value' => $roomId],
            ]);
            foreach ($existingSessions as $es) {
                if (in_array($es['status'] ?? '', ['active', 'expired'], true)) {
                    throw new RuntimeException('Room already has an active session (' . $es['id'] . '). Double assignment prevented.');
                }
            }

            if ($userId !== '') {
                $userDoc = $tx->getDocument('users', $userId);
                if ($userDoc) {
                    $customerName = $userDoc['name'] ?? $customerName;
                }
            }

            // Validate and reserve controllers for the room
            $ctrlId = 'ctrl_' . $roomId;
            $ctrl = $tx->getDocument('controllers', $ctrlId);
            if ($ctrl) {
                $availCtrl = (int)($ctrl['available_controllers'] ?? 0);
                if ($controllersCount > $availCtrl) {
                    throw new RuntimeException("Insufficient available controllers in {$room['name']}. Requested: {$controllersCount}, Available: {$availCtrl}.");
                }
                $tx->updateDocument('controllers', $ctrlId, [
                    'available_controllers' => $availCtrl - $controllersCount,
                    'in_use_controllers' => ((int)($ctrl['in_use_controllers'] ?? 0)) + $controllersCount,
                ]);
            }

            $gameTitle = 'Open Console Session';
            if ($gameId !== '') {
                $gameDoc = $tx->getDocument('games', $gameId);
                if ($gameDoc) {
                    $gameTitle = $gameDoc['title'] ?? $gameTitle;
                    $tx->updateDocument('games', $gameId, [
                        'play_count' => ((int)($gameDoc['play_count'] ?? 0)) + 1,
                    ]);
                }
            }

            $now = time();
            $endTs = $now + (int)round($durationHours * 3600);
            $rate = (float)($room['rate_per_hour'] ?? 8.00);
            $totalAmount = round($rate * $durationHours, 2);

            $session = $tx->createDocument('sessions', [
                'room_id' => $roomId,
                'room_name' => $room['name'],
                'room_type' => $room['type'] ?? 'regular',
                'user_id' => $userId ?: 'walk_in',
                'customer_name' => $customerName,
                'game_id' => $gameId ?: null,
                'game_title' => $gameTitle,
                'controllers_assigned' => $controllersCount,
                'start_timestamp' => $now,
                'end_timestamp' => $endTs,
                'start_time' => date('Y-m-d\TH:i:sP', $now),
                'scheduled_end_time' => date('Y-m-d\TH:i:sP', $endTs),
                'duration_hours' => $durationHours,
                'rate_per_hour' => $rate,
                'total_amount' => $totalAmount,
                'status' => 'active',
                'payment_status' => 'paid',
                'is_demo' => false,
            ]);

            $tx->updateDocument('rooms', $roomId, [
                'status' => 'occupied',
                'current_session_id' => $session['id'],
            ]);

            // Record actual financial transaction
            $tx->createDocument('transactions', [
                'type' => 'rental',
                'reference_id' => $session['id'],
                'user_id' => $userId ?: 'walk_in',
                'customer_name' => $customerName,
                'room_id' => $roomId,
                'description' => sprintf('%s Rental - %s (%.1f hrs)', strtoupper((string)($room['type'] ?? 'regular')), $room['name'], $durationHours),
                'amount' => $totalAmount,
                'payment_method' => $paymentMethod,
                'is_demo' => false,
                'transaction_date' => date('Y-m-d', $now),
            ]);

            // If started from queue, mark queue entry assigned
            if ($queueId !== '') {
                $tx->updateDocument('queues', $queueId, [
                    'status' => 'assigned',
                    'assigned_room_id' => $roomId,
                ]);
            } else {
                // Also check if this user had a waiting/notified queue entry and fulfill it
                if ($userId !== '') {
                    $userQueues = $tx->queryDocuments('queues', [
                        ['field' => 'user_id', 'op' => '==', 'value' => $userId],
                    ]);
                    foreach ($userQueues as $uq) {
                        if (in_array($uq['status'] ?? '', ['waiting', 'notified'], true)) {
                            $tx->updateDocument('queues', $uq['id'], [
                                'status' => 'assigned',
                                'assigned_room_id' => $roomId,
                            ]);
                        }
                    }
                }
            }

            if ($bookingId !== '') {
                $tx->updateDocument('bookings', $bookingId, [
                    'status' => 'completed',
                    'session_id' => $session['id'],
                ]);
            }

            if ($userId !== '') {
                $tx->createDocument('notifications', [
                    'user_id' => $userId,
                    'role_target' => 'customer',
                    'title' => 'Session Started: ' . $room['name'],
                    'message' => sprintf('Your %.1f-hour gaming session in %s has started! Enjoy your game.', $durationHours, $room['name']),
                    'type' => 'success',
                    'is_read' => false,
                ]);
            }

            return $session;
        });
    }

    /**
     * Admin: Extend an active or expired session and record the extension charge.
     */
    public function extendSession(string $sessionId, float $additionalHours, string $paymentMethod = 'Cash / Counter'): array
    {
        if ($additionalHours <= 0 || $additionalHours > 12) {
            throw new InvalidArgumentException('Additional hours must be between 0.5 and 12.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($sessionId, $additionalHours, $paymentMethod) {
            $session = $tx->getDocument('sessions', $sessionId);
            if (!$session) {
                throw new InvalidArgumentException('Session not found.');
            }
            if (!in_array($session['status'] ?? '', ['active', 'expired'], true)) {
                throw new RuntimeException('Only active or expired sessions can be extended.');
            }

            $now = time();
            $baseEnd = max($now, (int)($session['end_timestamp'] ?? $now));
            $newEnd = $baseEnd + (int)round($additionalHours * 3600);
            $rate = (float)($session['rate_per_hour'] ?? 8.00);
            $extraCharge = round($rate * $additionalHours, 2);
            $newDuration = round(((float)($session['duration_hours'] ?? 1)) + $additionalHours, 2);
            $newTotal = round(((float)($session['total_amount'] ?? 0)) + $extraCharge, 2);

            $updated = $tx->updateDocument('sessions', $sessionId, [
                'end_timestamp' => $newEnd,
                'scheduled_end_time' => date('Y-m-d\TH:i:sP', $newEnd),
                'duration_hours' => $newDuration,
                'total_amount' => $newTotal,
                'status' => 'active',
            ]);

            $tx->createDocument('transactions', [
                'type' => 'rental',
                'reference_id' => $sessionId,
                'user_id' => $session['user_id'] ?? 'walk_in',
                'customer_name' => $session['customer_name'] ?? 'Customer',
                'room_id' => $session['room_id'],
                'description' => sprintf('Session Extension - %s (+%.1f hrs)', $session['room_name'] ?? $session['room_id'], $additionalHours),
                'amount' => $extraCharge,
                'payment_method' => $paymentMethod,
                'is_demo' => false,
                'transaction_date' => date('Y-m-d', $now),
            ]);

            return $updated ?? $session;
        });
    }

    /**
     * Admin: End or Cancel a session, release controllers, set room to available,
     * and automatically notify the next customer in the queue!
     */
    public function endOrCancelSession(string $sessionId, string $action = 'complete'): array
    {
        if (!in_array($action, ['complete', 'cancel'], true)) {
            throw new InvalidArgumentException('Invalid session termination action.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($sessionId, $action) {
            $session = $tx->getDocument('sessions', $sessionId);
            if (!$session) {
                throw new InvalidArgumentException('Session not found.');
            }
            if (!in_array($session['status'] ?? '', ['active', 'expired'], true)) {
                throw new RuntimeException('Session is already ' . ($session['status'] ?? 'closed') . '.');
            }

            $roomId = (string)$session['room_id'];
            $newStatus = $action === 'cancel' ? 'cancelled' : 'completed';
            $now = time();

            $updatedSession = $tx->updateDocument('sessions', $sessionId, [
                'status' => $newStatus,
                'actual_end_time' => date('Y-m-d\TH:i:sP', $now),
            ]);

            // Release controllers back to available pool for this room
            $assignedCtrl = (int)($session['controllers_assigned'] ?? 0);
            $ctrlId = 'ctrl_' . $roomId;
            $ctrl = $tx->getDocument('controllers', $ctrlId);
            if ($ctrl && $assignedCtrl > 0) {
                $inUse = max(0, ((int)($ctrl['in_use_controllers'] ?? 0)) - $assignedCtrl);
                $total = (int)($ctrl['total_controllers'] ?? 4);
                $maint = (int)($ctrl['maintenance_controllers'] ?? 0);
                $avail = max(0, min($total - $maint, ((int)($ctrl['available_controllers'] ?? 0)) + $assignedCtrl));
                $tx->updateDocument('controllers', $ctrlId, [
                    'in_use_controllers' => $inUse,
                    'available_controllers' => $avail,
                ]);
            }

            // Free the room
            $room = $tx->getDocument('rooms', $roomId);
            $tx->updateDocument('rooms', $roomId, [
                'status' => 'available',
                'current_session_id' => null,
            ]);

            // Automatically check queue and notify the next waiting customer!
            $nextNotified = null;
            $roomType = $room['type'] ?? 'regular';
            $waitingQueue = $tx->queryDocuments('queues', [], 'created_at', 'ASC');
            foreach ($waitingQueue as $q) {
                if (($q['status'] ?? '') === 'waiting') {
                    $prefType = $q['preferred_room_type'] ?? 'regular';
                    if ($prefType === $roomType || $roomType === 'regular') {
                        $nextNotified = $tx->updateDocument('queues', $q['id'], [
                            'status' => 'notified',
                            'notified_room_id' => $roomId,
                            'notified_room_name' => $room['name'] ?? $roomId,
                            'notified_at' => date('Y-m-d\TH:i:sP', $now),
                        ]);

                        if (!empty($q['user_id'])) {
                            $tx->createDocument('notifications', [
                                'user_id' => $q['user_id'],
                                'role_target' => 'customer',
                                'title' => 'Your Room is Ready! (' . ($room['name'] ?? $roomId) . ')',
                                'message' => sprintf(
                                    'Great news %s! %s is now available for your party. Please head to the front desk within 10 minutes.',
                                    $q['customer_name'] ?? 'Gamer',
                                    $room['name'] ?? $roomId
                                ),
                                'type' => 'success',
                                'is_read' => false,
                            ]);
                        }
                        break;
                    }
                }
            }

            return [
                'session' => $updatedSession,
                'room_id' => $roomId,
                'next_queue_notified' => $nextNotified,
            ];
        });
    }
}
