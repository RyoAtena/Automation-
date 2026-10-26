<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Database\FirestoreInterface;
use RuntimeException;

class CatalogService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    /**
     * Returns all games enriched with their exact assigned rooms from `room_games`.
     */
    public function getGamesCatalog(array $filters = []): array
    {
        $games = $this->db->queryDocuments('games', [], 'title', 'ASC');
        $rooms = $this->db->queryDocuments('rooms', [], 'room_number', 'ASC');
        $mappings = $this->db->queryDocuments('room_games');

        $roomsById = [];
        foreach ($rooms as $r) {
            $roomsById[$r['id']] = $r;
        }

        $gameRoomsMap = [];
        foreach ($mappings as $m) {
            $gId = $m['game_id'] ?? '';
            $rId = $m['room_id'] ?? '';
            if (isset($roomsById[$rId])) {
                $gameRoomsMap[$gId][] = [
                    'id' => $rId,
                    'room_number' => $roomsById[$rId]['room_number'],
                    'name' => $roomsById[$rId]['name'],
                    'type' => $roomsById[$rId]['type'],
                    'status' => $roomsById[$rId]['status'],
                ];
            }
        }

        $search = strtolower(trim((string)($filters['search'] ?? '')));
        $genreFilter = strtolower(trim((string)($filters['genre'] ?? '')));
        $platformFilter = strtolower(trim((string)($filters['platform'] ?? '')));
        $roomFilter = trim((string)($filters['room_id'] ?? ''));

        $enriched = [];
        $genres = [];
        $platforms = [];

        foreach ($games as $g) {
            $gId = $g['id'];
            $assignedRooms = $gameRoomsMap[$gId] ?? [];
            $roomIds = array_column($assignedRooms, 'id');

            $g['available_rooms'] = $assignedRooms;
            $g['room_ids'] = $roomIds;

            if (!empty($g['genre'])) {
                $genres[$g['genre']] = true;
            }
            if (!empty($g['platform'])) {
                $platforms[$g['platform']] = true;
            }

            if ($search !== '') {
                $haystack = strtolower(($g['title'] ?? '') . ' ' . ($g['description'] ?? '') . ' ' . ($g['genre'] ?? '') . ' ' . ($g['platform'] ?? ''));
                if (!str_contains($haystack, $search)) {
                    continue;
                }
            }
            if ($genreFilter !== '' && strtolower((string)($g['genre'] ?? '')) !== $genreFilter) {
                continue;
            }
            if ($platformFilter !== '' && !str_contains(strtolower((string)($g['platform'] ?? '')), $platformFilter)) {
                continue;
            }
            if ($roomFilter !== '' && !in_array($roomFilter, $roomIds, true)) {
                continue;
            }

            $enriched[] = $g;
        }

        return [
            'games' => $enriched,
            'available_genres' => array_keys($genres),
            'available_platforms' => array_keys($platforms),
            'rooms' => array_map(static fn($r) => [
                'id' => $r['id'],
                'room_number' => $r['room_number'],
                'name' => $r['name'],
                'type' => $r['type'],
            ], $rooms),
        ];
    }

    /**
     * Admin: Create or update a game and its exact room assignments (`room_games`).
     */
    public function saveGame(array $input): array
    {
        $gameId = trim((string)($input['id'] ?? ''));
        $title = trim((string)($input['title'] ?? ''));
        $genre = trim((string)($input['genre'] ?? 'Action'));
        $platform = trim((string)($input['platform'] ?? 'PlayStation 5'));
        $coverUrl = trim((string)($input['cover_url'] ?? ''));
        $description = trim((string)($input['description'] ?? ''));
        $status = strtolower(trim((string)($input['status'] ?? 'available')));
        $roomIds = $input['room_ids'] ?? [];

        if ($title === '') {
            throw new InvalidArgumentException('Game title is required.');
        }
        if (!in_array($status, ['available', 'unavailable', 'maintenance'], true)) {
            $status = 'available';
        }
        if (is_string($roomIds)) {
            $roomIds = array_values(array_filter(array_map('trim', explode(',', $roomIds))));
        }

        if ($coverUrl === '') {
            $coverUrl = 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=600&q=80';
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use (
            $gameId,
            $title,
            $genre,
            $platform,
            $coverUrl,
            $description,
            $status,
            $roomIds
        ) {
            if ($gameId === '') {
                $gameId = 'game_' . preg_replace('/[^a-z0-9]+/i', '_', strtolower($title)) . '_' . random_int(10, 99);
            }
            $existing = $tx->getDocument('games', $gameId);

            $savedGame = $tx->setDocument('games', $gameId, [
                'id' => $gameId,
                'title' => $title,
                'genre' => $genre,
                'platform' => $platform,
                'cover_url' => $coverUrl,
                'description' => $description,
                'status' => $status,
                'play_count' => (int)($existing['play_count'] ?? 0),
            ], true);

            // Replace room mappings for this game in `room_games`
            $existingMappings = $tx->queryDocuments('room_games', [
                ['field' => 'game_id', 'op' => '==', 'value' => $gameId],
            ]);
            foreach ($existingMappings as $em) {
                $tx->deleteDocument('room_games', $em['id']);
            }

            foreach ($roomIds as $rId) {
                $rId = trim((string)$rId);
                if ($rId !== '' && $tx->getDocument('rooms', $rId) !== null) {
                    $mapId = 'rg_' . $rId . '_' . $gameId;
                    $tx->setDocument('room_games', $mapId, [
                        'id' => $mapId,
                        'room_id' => $rId,
                        'game_id' => $gameId,
                        'assigned_at' => date('Y-m-d\TH:i:sP'),
                    ], false);
                }
            }

            return $savedGame;
        });
    }

    public function deleteGame(string $gameId): bool
    {
        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($gameId) {
            $mappings = $tx->queryDocuments('room_games', [
                ['field' => 'game_id', 'op' => '==', 'value' => $gameId],
            ]);
            foreach ($mappings as $m) {
                $tx->deleteDocument('room_games', $m['id']);
            }
            return $tx->deleteDocument('games', $gameId);
        });
    }

    // =========================================================================
    // CONTROLLER INVENTORY & REQUESTS (Section 6)
    // =========================================================================

    public function getControllersAndRequests(?array $user = null): array
    {
        $controllers = $this->db->queryDocuments('controllers', [], 'room_id', 'ASC');
        $isAdmin = ($user['role'] ?? '') === 'admin';

        if ($isAdmin) {
            $requests = $this->db->queryDocuments('controller_requests', [], 'created_at', 'DESC');
        } elseif ($user !== null) {
            $requests = $this->db->queryDocuments('controller_requests', [
                ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
            ], 'created_at', 'DESC');
        } else {
            $requests = [];
        }

        return [
            'controllers' => $controllers,
            'requests' => $requests,
        ];
    }

    /**
     * Customer: Request additional controllers during a session.
     * Checks availability before allowing the request.
     */
    public function requestAdditionalControllers(array $user, array $input): array
    {
        $roomId = trim((string)($input['room_id'] ?? ''));
        $quantity = max(1, min(4, (int)($input['quantity'] ?? 1)));
        $notes = trim((string)($input['notes'] ?? ''));

        if ($roomId === '') {
            throw new InvalidArgumentException('Please select the room where you need additional controllers.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($user, $roomId, $quantity, $notes) {
            $room = $tx->getDocument('rooms', $roomId);
            if (!$room) {
                throw new InvalidArgumentException('Selected room not found.');
            }

            $ctrlId = 'ctrl_' . $roomId;
            $ctrl = $tx->getDocument('controllers', $ctrlId);
            if (!$ctrl) {
                throw new RuntimeException('No controller inventory configured for this room.');
            }

            $available = (int)($ctrl['available_controllers'] ?? 0);
            if ($available <= 0) {
                throw new RuntimeException("No additional controllers are currently available in {$room['name']} (0 available).");
            }
            if ($quantity > $available) {
                throw new RuntimeException("Only {$available} additional controller(s) are currently available in {$room['name']}, but you requested {$quantity}.");
            }

            $reqDoc = $tx->createDocument('controller_requests', [
                'user_id' => $user['id'],
                'customer_name' => $user['name'],
                'room_id' => $roomId,
                'room_name' => $room['name'],
                'session_id' => $room['current_session_id'] ?? null,
                'console' => $ctrl['console'] ?? 'Console Controller',
                'quantity' => $quantity,
                'notes' => $notes,
                'status' => 'pending', // pending | approved | rejected | returned
            ]);

            $tx->createDocument('notifications', [
                'user_id' => $user['id'],
                'role_target' => 'admin',
                'title' => 'Controller Request: ' . $room['name'],
                'message' => sprintf('%s requested %d additional controller(s) in %s.', $user['name'], $quantity, $room['name']),
                'type' => 'info',
                'is_read' => false,
            ]);

            return $reqDoc;
        });
    }

    /**
     * Admin: Approve or Reject a controller request atomically, preventing double-assignment.
     */
    public function handleControllerRequest(string $requestId, string $decision): array
    {
        $decision = strtolower(trim($decision));
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            throw new InvalidArgumentException('Decision must be approved or rejected.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($requestId, $decision) {
            $req = $tx->getDocument('controller_requests', $requestId);
            if (!$req) {
                throw new InvalidArgumentException('Controller request not found.');
            }
            if (($req['status'] ?? '') !== 'pending') {
                throw new RuntimeException('This controller request has already been ' . ($req['status'] ?? 'processed') . '.');
            }

            if ($decision === 'approved') {
                $roomId = (string)$req['room_id'];
                $qty = (int)($req['quantity'] ?? 1);
                $ctrlId = 'ctrl_' . $roomId;
                $ctrl = $tx->getDocument('controllers', $ctrlId);
                if (!$ctrl) {
                    throw new RuntimeException('Controller inventory record missing for room.');
                }

                $avail = (int)($ctrl['available_controllers'] ?? 0);
                if ($qty > $avail) {
                    throw new RuntimeException("Cannot approve: only {$avail} controller(s) remain available in {$req['room_name']}. Simultaneous assignment prevented.");
                }

                $tx->updateDocument('controllers', $ctrlId, [
                    'available_controllers' => $avail - $qty,
                    'in_use_controllers' => ((int)($ctrl['in_use_controllers'] ?? 0)) + $qty,
                ]);

                // If room has an active session, increment its controllers_assigned count so they get released when session ends
                if (!empty($req['session_id'])) {
                    $sess = $tx->getDocument('sessions', (string)$req['session_id']);
                    if ($sess && in_array($sess['status'] ?? '', ['active', 'expired'], true)) {
                        $tx->updateDocument('sessions', $sess['id'], [
                            'controllers_assigned' => ((int)($sess['controllers_assigned'] ?? 0)) + $qty,
                        ]);
                    }
                }
            }

            $updated = $tx->updateDocument('controller_requests', $requestId, [
                'status' => $decision,
                'processed_at' => date('Y-m-d\TH:i:sP'),
            ]);

            if (!empty($req['user_id'])) {
                $tx->createDocument('notifications', [
                    'user_id' => $req['user_id'],
                    'role_target' => 'customer',
                    'title' => 'Controller Request ' . ucfirst($decision),
                    'message' => sprintf(
                        'Your request for %d extra controller(s) in %s has been %s.',
                        (int)($req['quantity'] ?? 1),
                        $req['room_name'] ?? $req['room_id'],
                        $decision
                    ),
                    'type' => $decision === 'approved' ? 'success' : 'warning',
                    'is_read' => false,
                ]);
            }

            return $updated ?? $req;
        });
    }

    /**
     * Admin: Update controller inventory counts for a room.
     */
    public function updateControllerInventory(array $input): array
    {
        $ctrlId = trim((string)($input['id'] ?? ''));
        $roomId = trim((string)($input['room_id'] ?? ''));
        if ($ctrlId === '' && $roomId !== '') {
            $ctrlId = 'ctrl_' . $roomId;
        }
        $existing = $this->db->getDocument('controllers', $ctrlId);
        if (!$existing) {
            throw new InvalidArgumentException('Controller inventory record not found.');
        }

        $total = max(0, (int)($input['total_controllers'] ?? $existing['total_controllers']));
        $inUse = max(0, (int)($input['in_use_controllers'] ?? $existing['in_use_controllers']));
        $maint = max(0, (int)($input['maintenance_controllers'] ?? $existing['maintenance_controllers']));
        $console = trim((string)($input['console'] ?? $existing['console']));

        if ($inUse + $maint > $total) {
            throw new InvalidArgumentException('In-use (' . $inUse . ') + Maintenance (' . $maint . ') controllers cannot exceed Total controllers (' . $total . ').');
        }

        $available = $total - $inUse - $maint;

        return $this->db->updateDocument('controllers', $ctrlId, [
            'console' => $console,
            'total_controllers' => $total,
            'available_controllers' => $available,
            'in_use_controllers' => $inUse,
            'maintenance_controllers' => $maint,
        ]) ?? $existing;
    }
}
