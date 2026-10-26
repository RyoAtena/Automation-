<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Config\Env;
use Nexus\Database\FirestoreInterface;
use RuntimeException;

class SupportService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    // =========================================================================
    // SECTION 10: AI CHATBOT (Live Database Context + Optional Server AI API)
    // =========================================================================

    public function getChatbotMetadata(): array
    {
        $apiKey = trim((string)Env::get('AI_API_KEY', ''));
        $isExternalAiConfigured = $apiKey !== '';
        return [
            'ai_api_configured' => $isExternalAiConfigured,
            'mode' => $isExternalAiConfigured ? 'cloud_llm_with_live_db' : 'live_db_faq_fallback',
            'mode_label' => $isExternalAiConfigured
                ? 'Connected to External AI API + Live Arena Database'
                : 'Live-Data FAQ Assistant (Fallback Mode — No External AI API Key Configured)',
            'suggested_questions' => [
                'What rooms are available right now?',
                'Which room has Tekken 8 or Spider-Man 2?',
                'What are the VIP booking rates?',
                'How many controllers are available in each room?',
                'How do I order food and drinks?',
                'How does the queue work?',
                'What are the business opening hours?',
            ],
        ];
    }

    public function askChatbot(string $question): array
    {
        $question = trim($question);
        if ($question === '') {
            throw new InvalidArgumentException('Please enter a question.');
        }

        $meta = $this->getChatbotMetadata();
        $liveContext = $this->buildLiveBusinessContext();

        if ($meta['ai_api_configured']) {
            $llmReply = $this->callGeminiApi($question, $liveContext);
            if ($llmReply !== null) {
                return [
                    'reply' => $llmReply,
                    'mode' => 'cloud_llm_with_live_db',
                    'mode_label' => $meta['mode_label'],
                    'timestamp' => date('Y-m-d\TH:i:sP'),
                ];
            }
        }

        // Deterministic Live-Data FAQ Engine using real database records
        $reply = $this->generateLiveDatabaseAnswer($question, $liveContext);

        return [
            'reply' => $reply,
            'mode' => 'live_db_faq_fallback',
            'mode_label' => $meta['mode_label'],
            'timestamp' => date('Y-m-d\TH:i:sP'),
        ];
    }

    private function buildLiveBusinessContext(): array
    {
        $settings = $this->db->getDocument('settings', 'business_config') ?? [];
        $rooms = $this->db->queryDocuments('rooms', [], 'room_number', 'ASC');
        $games = $this->db->queryDocuments('games', [], 'title', 'ASC');
        $mappings = $this->db->queryDocuments('room_games');
        $controllers = $this->db->queryDocuments('controllers');
        $menu = $this->db->queryDocuments('menu_items', [
            ['field' => 'is_active', 'op' => '==', 'value' => true],
        ]);
        $queues = $this->db->queryDocuments('queues');

        $roomsById = [];
        foreach ($rooms as $r) {
            $roomsById[$r['id']] = $r;
        }

        $gameLocations = [];
        foreach ($mappings as $m) {
            $gId = $m['game_id'] ?? '';
            $rId = $m['room_id'] ?? '';
            if (isset($roomsById[$rId])) {
                $gameLocations[$gId][] = $roomsById[$rId]['name'] . ' (' . strtoupper((string)$roomsById[$rId]['status']) . ')';
            }
        }

        $waitingCount = 0;
        foreach ($queues as $q) {
            if (in_array($q['status'] ?? '', ['waiting', 'notified'], true)) {
                $waitingCount++;
            }
        }

        return [
            'settings' => $settings,
            'rooms' => $rooms,
            'games' => $games,
            'game_locations' => $gameLocations,
            'controllers' => $controllers,
            'menu' => $menu,
            'waiting_queue_count' => $waitingCount,
        ];
    }

    private function generateLiveDatabaseAnswer(string $question, array $ctx): string
    {
        $q = strtolower($question);
        $settings = $ctx['settings'];
        $rooms = $ctx['rooms'];
        $games = $ctx['games'];
        $gameLocations = $ctx['game_locations'];
        $controllers = $ctx['controllers'];
        $menu = $ctx['menu'];
        $waitingCount = $ctx['waiting_queue_count'];

        // 1. Check if asking about a specific game by title or "which room has..."
        foreach ($games as $g) {
            $titleLower = strtolower((string)$g['title']);
            // Also check keywords like "tekken", "spider", "halo", "mario", "smash", "gran turismo", "elden", "fc 26", "fc26"
            $keywords = array_filter(explode(' ', preg_replace('/[^a-z0-9 ]/', ' ', $titleLower)), static fn($w) => strlen($w) >= 4);
            $matchedGame = str_contains($q, $titleLower);
            if (!$matchedGame) {
                foreach ($keywords as $kw) {
                    if (str_contains($q, $kw)) {
                        $matchedGame = true;
                        break;
                    }
                }
            }
            if ($matchedGame) {
                $locs = $gameLocations[$g['id']] ?? [];
                $locText = empty($locs)
                    ? 'Saat ini belum terpasang di ruangan aktif.'
                    : implode(', ', $locs);
                return sprintf(
                    "%s (%s • %s)\nLokasi Ruangan: %s\n\nDeskripsi: %s",
                    $g['title'],
                    $g['platform'],
                    $g['genre'],
                    $locText,
                    $g['description'] ?? ''
                );
            }
        }

        // 2. General Game catalog question
        if (str_contains($q, 'game') || str_contains($q, 'play') || str_contains($q, 'catalog') || str_contains($q, 'which room has')) {
            $lines = ["Daftar Katalog Game & Lokasi Ruangan:"];
            foreach ($games as $g) {
                $locs = $gameLocations[$g['id']] ?? ['Belum dialokasikan'];
                $lines[] = sprintf("• %s (%s): %s", $g['title'], $g['platform'], implode(', ', $locs));
            }
            return implode("\n", $lines);
        }

        // 3. VIP Booking Rates & Suites
        if (str_contains($q, 'vip') || str_contains($q, 'rate') || str_contains($q, 'price') || str_contains($q, 'harga') || str_contains($q, 'biaya') || str_contains($q, 'cost') || str_contains($q, 'book')) {
            $vipLines = ["Daftar Ruang VIP & Tarif per Jam:"];
            foreach ($rooms as $r) {
                if (($r['type'] ?? '') === 'vip') {
                    $vipLines[] = sprintf(
                        "• %s — Rp %s/jam (Maks %d pemain, Status: %s) | Konsol: %s | Fasilitas: %s",
                        $r['name'],
                        number_format((float)$r['rate_per_hour'], 0, ',', '.'),
                        (int)$r['max_players'],
                        strtoupper((string)$r['status']),
                        implode(', ', $r['consoles'] ?? []),
                        implode(', ', array_slice($r['facilities'] ?? [], 0, 3))
                    );
                }
            }
            $durations = implode(', ', $settings['allowed_durations_hours'] ?? [1, 2, 3, 4, 6, 8]);
            $vipLines[] = "\nRuang Reguler (Biasa): Rp " . number_format((float)($settings['regular_default_rate'] ?? 20000), 0, ',', '.') . "/jam.\nPilihan durasi sewa: {$durations} jam. Silakan buka menu VIP Suite Booking untuk melakukan reservasi.";
            return implode("\n", $vipLines);
        }

        // 4. Controller Availability
        if (str_contains($q, 'controller') || str_contains($q, 'gamepad') || str_contains($q, 'stik') || str_contains($q, 'joystick') || str_contains($q, 'dualsense')) {
            $lines = ["Status Stok Controller per Ruangan Saat Ini:"];
            $totalAvail = 0;
            foreach ($controllers as $c) {
                $avail = (int)($c['available_controllers'] ?? 0);
                $totalAvail += $avail;
                $lines[] = sprintf(
                    "• %s (%s): %d tersedia (%d dipakai, %d total)",
                    $c['room_name'] ?? $c['room_id'],
                    $c['console'] ?? 'Controller',
                    $avail,
                    (int)($c['in_use_controllers'] ?? 0),
                    (int)($c['total_controllers'] ?? 0)
                );
            }
            $lines[] = "\nTotal controller tersedia di seluruh ruangan: {$totalAvail} unit. Anda dapat meminta tambahan controller melalui halaman My Orders & Session.";
            return implode("\n", $lines);
        }

        // 5. Food & Drinks Ordering
        if (str_contains($q, 'food') || str_contains($q, 'drink') || str_contains($q, 'makan') || str_contains($q, 'minum') || str_contains($q, 'menu') || str_contains($q, 'order') || str_contains($q, 'snack') || str_contains($q, 'burger') || str_contains($q, 'wing')) {
            $lines = ["Menu Makanan & Minuman yang Tersedia:"];
            foreach ($menu as $m) {
                $stock = (int)($m['stock'] ?? 0);
                if ($stock > 0) {
                    $lines[] = sprintf("• %s (%s) — Rp %s (Stok: %d)", $m['name'], $m['category'], number_format((float)$m['price'], 0, ',', '.'), $stock);
                }
            }
            $lines[] = "\nCara pesan: Tambahkan item ke keranjang pada menu Food & Drinks, pilih nomor ruangan Anda, lalu klik Confirm & Submit Order.";
            return implode("\n", $lines);
        }

        // 6. Queue System
        if (str_contains($q, 'queue') || str_contains($q, 'antre') || str_contains($q, 'antri') || str_contains($q, 'wait') || str_contains($q, 'line') || str_contains($q, 'full')) {
            return sprintf(
                "Cara Kerja Sistem Antrean (Queue):\n• Jumlah antrean saat ini: %d pelanggan.\n• Ketika seluruh ruang reguler penuh, Anda dapat mendaftar antrean di halaman Rooms & Live Queue.\n• Ruangan dialokasikan sesuai urutan antrean.\n• Saat sesi selesai dan ruangan kembali kosong, sistem otomatis mengirimkan notifikasi kepada pelanggan berikutnya.",
                $waitingCount
            );
        }

        // 7. Opening Hours
        if (str_contains($q, 'hour') || str_contains($q, 'jam') || str_contains($q, 'buka') || str_contains($q, 'open') || str_contains($q, 'close') || str_contains($q, 'time') || str_contains($q, 'schedule')) {
            return sprintf(
                "Jam Operasional Nexus Arena:\n• Jam Buka: %s\n• Tarif Ruang Reguler: Rp %s/jam\n• Tarif Ruang VIP: Rp %s/jam",
                $settings['opening_hours'] ?? '10:00 - 02:00 WIB (Setiap Hari)',
                number_format((float)($settings['regular_default_rate'] ?? 20000), 0, ',', '.'),
                number_format((float)($settings['vip_default_rate'] ?? 50000), 0, ',', '.')
            );
        }

        // 8. Room Availability (Default / "What rooms are available?")
        $availRooms = [];
        $occupiedRooms = [];
        foreach ($rooms as $r) {
            $status = $r['status'] ?? 'available';
            $entry = sprintf("  - %s (%s, Rp %s/jam, %s)", $r['name'], strtoupper((string)$r['type']), number_format((float)$r['rate_per_hour'], 0, ',', '.'), implode('/', $r['consoles'] ?? []));
            if ($status === 'available') {
                $availRooms[] = $entry;
            } else {
                $occupiedRooms[] = $entry . ' [' . strtoupper($status) . ']';
            }
        }

        $availText = empty($availRooms)
            ? "Saat ini tidak ada ruangan kosong (Antrean menunggu: {$waitingCount})."
            : "Tersedia saat ini (" . count($availRooms) . " ruangan):\n" . implode("\n", $availRooms);

        return sprintf(
            "Status Ketersediaan Ruangan Saat Ini:\n• %s\n• Ruangan terpakai: %s\n• Antrean Menunggu: %d pelanggan\n• Jam Operasional: %s\n\nSilakan tanyakan lokasi game tertentu (contoh: \"Which room has Tekken 8?\"), tarif VIP, stok controller, atau menu makanan.",
            $availText,
            empty($occupiedRooms) ? 'Tidak ada ruangan yang sedang terpakai' : "\n" . implode("\n", $occupiedRooms),
            $waitingCount,
            $settings['opening_hours'] ?? '10:00 - 02:00 WIB (Setiap Hari)'
        );
    }

    private function callGeminiApi(string $question, array $ctx): ?string
    {
        try {
            $apiKey = trim((string)Env::get('AI_API_KEY', ''));
            $model = trim((string)Env::get('AI_MODEL', 'gemini-2.5-flash'));
            if ($apiKey === '') {
                return null;
            }
            $contextSummary = $this->generateLiveDatabaseAnswer('summary of rooms games controllers menu hours', $ctx);
            $prompt = "You are the AI Concierge for Nexus Arena Gaming & Rental. Answer concisely using ONLY this live business data:\n" . $contextSummary . "\n\nCustomer Question: " . $question;

            $url = sprintf('https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s', rawurlencode($model), rawurlencode($apiKey));
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode([
                    'contents' => [['parts' => [['text' => $prompt]]]],
                ]),
                CURLOPT_TIMEOUT => 10,
            ]);
            $resp = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($code === 200 && is_string($resp)) {
                $decoded = json_decode($resp, true);
                $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
                if (is_string($text) && trim($text) !== '') {
                    return trim(str_replace(['**', '*'], '', $text));
                }
            }
        } catch (\Throwable) {
        }
        return null;
    }

    // =========================================================================
    // SECTION 11: HUMAN ADMIN SUPPORT CHAT (Separate from AI Chatbot)
    // =========================================================================

    public function getSupportState(array $user, ?string $targetConversationId = null): array
    {
        $settings = $this->db->getDocument('settings', 'business_config') ?? [];
        $adminOnline = (bool)($settings['admin_online'] ?? true);
        $isAdmin = ($user['role'] ?? '') === 'admin';

        if ($isAdmin) {
            $conversations = $this->db->queryDocuments('support_conversations', [], 'updated_at', 'DESC');
            $activeConvId = $targetConversationId ?: ($conversations[0]['id'] ?? null);
            $messages = [];
            if ($activeConvId !== null) {
                $messages = $this->db->queryDocuments('support_messages', [
                    ['field' => 'conversation_id', 'op' => '==', 'value' => $activeConvId],
                ], 'created_at', 'ASC');

                // Mark customer messages as read by admin
                foreach ($messages as &$m) {
                    if (($m['sender_role'] ?? '') === 'customer' && empty($m['is_read'])) {
                        $m['is_read'] = true;
                        $this->db->updateDocument('support_messages', $m['id'], ['is_read' => true]);
                    }
                }
                unset($m);
                $this->db->updateDocument('support_conversations', $activeConvId, ['unread_admin_count' => 0]);
            }

            return [
                'admin_online' => $adminOnline,
                'conversations' => $conversations,
                'active_conversation_id' => $activeConvId,
                'messages' => $messages,
            ];
        }

        // Customer view: find or initialize conversation info
        $convs = $this->db->queryDocuments('support_conversations', [
            ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
        ], 'updated_at', 'DESC', 1);

        $conv = $convs[0] ?? null;
        $messages = [];

        if ($conv !== null) {
            $messages = $this->db->queryDocuments('support_messages', [
                ['field' => 'conversation_id', 'op' => '==', 'value' => $conv['id']],
            ], 'created_at', 'ASC');

            // Mark admin replies as read by customer
            foreach ($messages as &$m) {
                if (($m['sender_role'] ?? '') === 'admin' && empty($m['is_read'])) {
                    $m['is_read'] = true;
                    $this->db->updateDocument('support_messages', $m['id'], ['is_read' => true]);
                }
            }
            unset($m);
            $this->db->updateDocument('support_conversations', $conv['id'], ['unread_customer_count' => 0]);
        }

        return [
            'admin_online' => $adminOnline,
            'welcome_message' => $settings['support_welcome_message'] ?? 'Connect with a live Nexus Arena Admin for help.',
            'conversation' => $conv,
            'messages' => $messages,
        ];
    }

    public function sendSupportMessage(array $sender, array $input): array
    {
        $messageText = trim((string)($input['message'] ?? ''));
        if ($messageText === '') {
            throw new InvalidArgumentException('Message cannot be empty.');
        }

        $isAdmin = ($sender['role'] ?? '') === 'admin';

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($sender, $input, $messageText, $isAdmin) {
            if ($isAdmin) {
                $convId = trim((string)($input['conversation_id'] ?? ''));
                if ($convId === '') {
                    throw new InvalidArgumentException('Conversation ID is required for admin reply.');
                }
                $conv = $tx->getDocument('support_conversations', $convId);
                if (!$conv) {
                    throw new InvalidArgumentException('Support conversation not found.');
                }
            } else {
                $convs = $tx->queryDocuments('support_conversations', [
                    ['field' => 'user_id', 'op' => '==', 'value' => $sender['id']],
                ], 'updated_at', 'DESC', 1);

                if (!empty($convs)) {
                    $conv = $convs[0];
                } else {
                    // Check if customer has an active session to link
                    $activeSessId = null;
                    $roomNum = null;
                    $userSessions = $tx->queryDocuments('sessions', [
                        ['field' => 'user_id', 'op' => '==', 'value' => $sender['id']],
                    ]);
                    foreach ($userSessions as $us) {
                        if (in_array($us['status'] ?? '', ['active', 'expired'], true)) {
                            $activeSessId = $us['id'];
                            $roomNum = $us['room_name'] ?? $us['room_id'];
                            break;
                        }
                    }

                    $conv = $tx->createDocument('support_conversations', [
                        'user_id' => $sender['id'],
                        'customer_name' => $sender['name'],
                        'customer_email' => $sender['email'] ?? '',
                        'session_id' => $activeSessId,
                        'room_number' => $roomNum,
                        'status' => 'open',
                        'unread_admin_count' => 0,
                        'unread_customer_count' => 0,
                        'last_message' => $messageText,
                    ]);
                }
            }

            $msg = $tx->createDocument('support_messages', [
                'conversation_id' => $conv['id'],
                'user_id' => $conv['user_id'],
                'sender_id' => $sender['id'],
                'sender_name' => $sender['name'],
                'sender_role' => $isAdmin ? 'admin' : 'customer',
                'message' => $messageText,
                'is_read' => false,
            ]);

            $unreadAdmin = (int)($conv['unread_admin_count'] ?? 0);
            $unreadCust = (int)($conv['unread_customer_count'] ?? 0);

            if ($isAdmin) {
                $unreadCust++;
            } else {
                $unreadAdmin++;
            }

            $tx->updateDocument('support_conversations', $conv['id'], [
                'last_message' => $messageText,
                'unread_admin_count' => $unreadAdmin,
                'unread_customer_count' => $unreadCust,
                'status' => 'open',
            ]);

            return $msg;
        });
    }

    public function setAdminOnlineStatus(bool $online): array
    {
        return $this->db->updateDocument('settings', 'business_config', [
            'admin_online' => $online,
        ]) ?? ['admin_online' => $online];
    }
}
