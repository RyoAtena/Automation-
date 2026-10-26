<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Nexus\Database\FirestoreRepository;
use Nexus\Database\Seeder;
use Nexus\Middleware\AuthMiddleware;
use Nexus\Services\AuthService;
use Nexus\Services\BookingService;
use Nexus\Services\CatalogService;
use Nexus\Services\FeedbackService;
use Nexus\Services\FinanceService;
use Nexus\Services\OrderService;
use Nexus\Services\RoomQueueService;
use Nexus\Services\SupportService;

$db = FirestoreRepository::getInstance();
Seeder::ensureSeeded($db);

$authMiddleware = new AuthMiddleware($db);
$authService = new AuthService($db);
$roomQueueService = new RoomQueueService($db);
$bookingService = new BookingService($db);
$catalogService = new CatalogService($db);
$orderService = new OrderService($db);
$financeService = new FinanceService($db);
$supportService = new SupportService($db);
$feedbackService = new FeedbackService($db);

$action = trim((string)($_GET['action'] ?? ''));

// Handle CSV export before setting application/json header
if ($action === 'finance.export_csv') {
    try {
        $authMiddleware->requireAdmin();
        $csv = $financeService->exportTransactionsCsv($_GET);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="nexus_arena_financial_report_' . date('Y-m-d') . '.csv"');
        echo $csv;
        exit;
    } catch (Throwable $e) {
        http_response_code($e instanceof InvalidArgumentException ? 400 : (http_response_code() >= 400 ? http_response_code() : 403));
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
        exit;
    }
}

header('Content-Type: application/json; charset=utf-8');

$rawBody = (string)file_get_contents('php://input');
$input = [];
if ($rawBody !== '') {
    $decoded = json_decode($rawBody, true);
    if (is_array($decoded)) {
        $input = $decoded;
    }
}
if (empty($input) && !empty($_POST)) {
    $input = $_POST;
}

if ($action === '' && isset($input['action'])) {
    $action = trim((string)$input['action']);
}

try {
    $currentUser = $authMiddleware->getCurrentUser();

    $response = match ($action) {
        // =====================================================================
        // SYSTEM & BOOTSTRAP STATE
        // =====================================================================
        'system.init' => (static function () use (
            $db,
            $currentUser,
            $roomQueueService,
            $bookingService,
            $catalogService,
            $orderService,
            $supportService,
            $feedbackService
        ): array {
            $roomsState = $roomQueueService->getAllRoomsEnriched($currentUser);
            $settings = $roomQueueService->getSettings();
            $notifications = [];
            if ($currentUser !== null) {
                $allNotifs = $db->queryDocuments('notifications', [], 'created_at', 'DESC', 30);
                $isAdmin = ($currentUser['role'] ?? '') === 'admin';
                foreach ($allNotifs as $n) {
                    if ($isAdmin && ($n['role_target'] ?? '') === 'admin') {
                        $notifications[] = $n;
                    } elseif (!$isAdmin && ($n['user_id'] ?? '') === $currentUser['id'] && ($n['role_target'] ?? 'customer') === 'customer') {
                        $notifications[] = $n;
                    }
                }
            }

            return [
                'user' => $currentUser,
                'db_status' => $db->getStatusInfo(),
                'settings' => $settings,
                'rooms_state' => $roomsState,
                'vip_config' => $bookingService->getVipRoomsAndConfig(),
                'catalog' => $catalogService->getGamesCatalog(),
                'menu' => $orderService->getMenu(($currentUser['role'] ?? '') === 'admin'),
                'chatbot_meta' => $supportService->getChatbotMetadata(),
                'feedback_summary' => $feedbackService->getFeedbackSummary($currentUser),
                'notifications' => array_slice($notifications, 0, 15),
            ];
        })(),

        // =====================================================================
        // AUTHENTICATION & PROFILE
        // =====================================================================
        'auth.login' => $authService->login(
            (string)($input['email'] ?? ''),
            (string)($input['password'] ?? '')
        ),

        'auth.register' => $authService->register($input),

        'auth.logout' => (static function () use ($authService): array {
            $authService->logout();
            return ['logged_out' => true];
        })(),

        'auth.me' => [
            'user' => $currentUser,
        ],

        'profile.update' => (static function () use ($authMiddleware, $authService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['user' => $authService->updateProfile($user['id'], $input)];
        })(),

        'profile.history' => (static function () use ($authMiddleware, $db, $bookingService, $orderService, $catalogService): array {
            $user = $authMiddleware->requireAuth();
            $sessions = $db->queryDocuments('sessions', [
                ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
            ], 'created_at', 'DESC');
            $queues = $db->queryDocuments('queues', [
                ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
            ], 'created_at', 'DESC');
            return [
                'sessions' => $sessions,
                'bookings' => $bookingService->listBookings($user),
                'orders' => $orderService->listOrders($user),
                'queues' => $queues,
                'controller_requests' => $catalogService->getControllersAndRequests($user)['requests'],
            ];
        })(),

        // =====================================================================
        // ROOMS, TIMERS & QUEUES (Section 3 & Section 8)
        // =====================================================================
        'rooms.list' => $roomQueueService->getAllRoomsEnriched($currentUser),

        'rooms.save' => (static function () use ($authMiddleware, $roomQueueService, $input): array {
            $authMiddleware->requireAdmin();
            return ['room' => $roomQueueService->saveRoom($input)];
        })(),

        'sessions.start' => (static function () use ($authMiddleware, $roomQueueService, $input): array {
            $authMiddleware->requireAdmin();
            return ['session' => $roomQueueService->startSession($input)];
        })(),

        'sessions.extend' => (static function () use ($authMiddleware, $roomQueueService, $input): array {
            $authMiddleware->requireAdmin();
            return [
                'session' => $roomQueueService->extendSession(
                    (string)($input['session_id'] ?? ''),
                    (float)($input['additional_hours'] ?? 1),
                    (string)($input['payment_method'] ?? 'Cash / Counter')
                ),
            ];
        })(),

        'sessions.end' => (static function () use ($authMiddleware, $roomQueueService, $input): array {
            $authMiddleware->requireAdmin();
            return $roomQueueService->endOrCancelSession(
                (string)($input['session_id'] ?? ''),
                (string)($input['termination_type'] ?? 'complete')
            );
        })(),

        'sessions.list' => (static function () use ($authMiddleware, $db, $roomQueueService): array {
            $user = $authMiddleware->requireAuth();
            $sync = $roomQueueService->syncSessionTimers();
            if (($user['role'] ?? '') === 'admin') {
                $sessions = $db->queryDocuments('sessions', [], 'created_at', 'DESC');
            } else {
                $sessions = $db->queryDocuments('sessions', [
                    ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
                ], 'created_at', 'DESC');
            }
            return [
                'sync' => $sync,
                'sessions' => $sessions,
            ];
        })(),

        'queue.join' => (static function () use ($authMiddleware, $roomQueueService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['queue_entry' => $roomQueueService->joinQueue($user, $input)];
        })(),

        'queue.cancel' => (static function () use ($authMiddleware, $roomQueueService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['queue_entry' => $roomQueueService->leaveOrCancelQueue((string)($input['queue_id'] ?? ''), $user)];
        })(),

        // =====================================================================
        // VIP BOOKINGS (Section 4)
        // =====================================================================
        'bookings.list' => (static function () use ($authMiddleware, $bookingService): array {
            $user = $authMiddleware->requireAuth();
            return [
                'bookings' => $bookingService->listBookings($user),
                'vip_config' => $bookingService->getVipRoomsAndConfig(),
            ];
        })(),

        'bookings.create' => (static function () use ($authMiddleware, $bookingService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['booking' => $bookingService->createVipBooking($user, $input)];
        })(),

        'bookings.status' => (static function () use ($authMiddleware, $bookingService, $input): array {
            $user = $authMiddleware->requireAuth();
            return [
                'booking' => $bookingService->updateBookingStatus(
                    (string)($input['booking_id'] ?? ''),
                    (string)($input['status'] ?? ''),
                    $user
                ),
            ];
        })(),

        // =====================================================================
        // GAME CATALOG & ROOM MAPPING (Section 5)
        // =====================================================================
        'games.list' => $catalogService->getGamesCatalog($_GET),

        'games.save' => (static function () use ($authMiddleware, $catalogService, $input): array {
            $authMiddleware->requireAdmin();
            return ['game' => $catalogService->saveGame($input)];
        })(),

        'games.delete' => (static function () use ($authMiddleware, $catalogService, $input): array {
            $authMiddleware->requireAdmin();
            return ['deleted' => $catalogService->deleteGame((string)($input['game_id'] ?? ''))];
        })(),

        // =====================================================================
        // CONTROLLER INVENTORY & REQUESTS (Section 6)
        // =====================================================================
        'controllers.list' => $catalogService->getControllersAndRequests($currentUser),

        'controllers.request' => (static function () use ($authMiddleware, $catalogService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['request' => $catalogService->requestAdditionalControllers($user, $input)];
        })(),

        'controllers.decide' => (static function () use ($authMiddleware, $catalogService, $input): array {
            $authMiddleware->requireAdmin();
            return [
                'request' => $catalogService->handleControllerRequest(
                    (string)($input['request_id'] ?? ''),
                    (string)($input['decision'] ?? '')
                ),
            ];
        })(),

        'controllers.update' => (static function () use ($authMiddleware, $catalogService, $input): array {
            $authMiddleware->requireAdmin();
            return ['controller' => $catalogService->updateControllerInventory($input)];
        })(),

        // =====================================================================
        // FOOD & BEVERAGE MENU, ORDERS & STOCK AUDIT (Section 7)
        // =====================================================================
        'menu.list' => $orderService->getMenu(($currentUser['role'] ?? '') === 'admin'),

        'menu.save' => (static function () use ($authMiddleware, $orderService, $input): array {
            $admin = $authMiddleware->requireAdmin();
            return ['menu_item' => $orderService->saveMenuItem($input, $admin)];
        })(),

        'menu.movements' => (static function () use ($authMiddleware, $orderService): array {
            $authMiddleware->requireAdmin();
            return ['movements' => $orderService->getInventoryMovements()];
        })(),

        'orders.list' => (static function () use ($authMiddleware, $orderService): array {
            $user = $authMiddleware->requireAuth();
            return ['orders' => $orderService->listOrders($user)];
        })(),

        'orders.create' => (static function () use ($authMiddleware, $orderService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['order' => $orderService->createOrder($user, $input)];
        })(),

        'orders.status' => (static function () use ($authMiddleware, $orderService, $input): array {
            $user = $authMiddleware->requireAuth();
            return [
                'order' => $orderService->updateOrderStatus(
                    (string)($input['order_id'] ?? ''),
                    (string)($input['status'] ?? ''),
                    $user
                ),
            ];
        })(),

        // =====================================================================
        // FINANCIAL ANALYTICS & EXPENSES (Section 9)
        // =====================================================================
        'finance.report' => (static function () use ($authMiddleware, $financeService): array {
            $authMiddleware->requireAdmin();
            return $financeService->getFinancialReport($_GET);
        })(),

        'finance.add_expense' => (static function () use ($authMiddleware, $financeService, $input): array {
            $admin = $authMiddleware->requireAdmin();
            return ['expense' => $financeService->addExpense($input, $admin)];
        })(),

        'finance.delete_expense' => (static function () use ($authMiddleware, $financeService, $input): array {
            $authMiddleware->requireAdmin();
            return ['deleted' => $financeService->deleteExpense((string)($input['expense_id'] ?? ''))];
        })(),

        // =====================================================================
        // AI CHATBOT & HUMAN SUPPORT CHAT (Section 10 & Section 11)
        // =====================================================================
        'chatbot.ask' => $supportService->askChatbot((string)($input['question'] ?? '')),

        'support.state' => (static function () use ($authMiddleware, $supportService): array {
            $user = $authMiddleware->requireAuth();
            $convId = isset($_GET['conversation_id']) ? trim((string)$_GET['conversation_id']) : null;
            return $supportService->getSupportState($user, $convId);
        })(),

        'support.send' => (static function () use ($authMiddleware, $supportService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['message' => $supportService->sendSupportMessage($user, $input)];
        })(),

        'support.toggle_online' => (static function () use ($authMiddleware, $supportService, $input): array {
            $authMiddleware->requireAdmin();
            return $supportService->setAdminOnlineStatus((bool)($input['admin_online'] ?? true));
        })(),

        // =====================================================================
        // RATINGS & FEEDBACK (Section 12)
        // =====================================================================
        'feedback.list' => $feedbackService->getFeedbackSummary($currentUser),

        'feedback.submit' => (static function () use ($authMiddleware, $feedbackService, $input): array {
            $user = $authMiddleware->requireAuth();
            return ['feedback' => $feedbackService->submitFeedback($user, $input)];
        })(),

        'feedback.respond' => (static function () use ($authMiddleware, $feedbackService, $input): array {
            $authMiddleware->requireAdmin();
            return [
                'feedback' => $feedbackService->respondToFeedback(
                    (string)($input['feedback_id'] ?? ''),
                    $input
                ),
            ];
        })(),

        // =====================================================================
        // ADMIN USER MANAGEMENT & BUSINESS SETTINGS
        // =====================================================================
        'users.list' => (static function () use ($authMiddleware, $authService): array {
            $authMiddleware->requireAdmin();
            return ['users' => $authService->listAllUsers()];
        })(),

        'users.update' => (static function () use ($authMiddleware, $authService, $input): array {
            $authMiddleware->requireAdmin();
            return [
                'user' => $authService->adminUpdateUser(
                    (string)($input['user_id'] ?? ''),
                    $input
                ),
            ];
        })(),

        'settings.save' => (static function () use ($authMiddleware, $db, $input): array {
            $authMiddleware->requireAdmin();
            $allowedDurations = $input['allowed_durations_hours'] ?? [1, 2, 3, 4, 6, 8];
            if (is_string($allowedDurations)) {
                $allowedDurations = array_values(array_filter(array_map('intval', explode(',', $allowedDurations)), static fn($v) => $v > 0));
            }
            $updates = [
                'business_name' => trim((string)($input['business_name'] ?? 'Nexus Arena Gaming & Rental')),
                'tagline' => trim((string)($input['tagline'] ?? 'Console Lounge & VIP Rental System')),
                'regular_default_rate' => max(1.0, (float)($input['regular_default_rate'] ?? 20000)),
                'vip_default_rate' => max(1.0, (float)($input['vip_default_rate'] ?? 50000)),
                'allowed_durations_hours' => $allowedDurations ?: [1, 2, 3, 4, 6, 8],
                'opening_hours' => trim((string)($input['opening_hours'] ?? '10:00 - 02:00 WIB (Setiap Hari)')),
                'low_stock_threshold' => max(1, (int)($input['low_stock_threshold'] ?? 5)),
                'low_time_warning_minutes' => max(1, (int)($input['low_time_warning_minutes'] ?? 15)),
                'admin_online' => isset($input['admin_online']) ? (bool)$input['admin_online'] : true,
            ];
            return [
                'settings' => $db->setDocument('settings', 'business_config', $updates, true),
            ];
        })(),

        'notifications.mark_read' => (static function () use ($authMiddleware, $db, $input): array {
            $user = $authMiddleware->requireAuth();
            $notifId = trim((string)($input['notification_id'] ?? ''));
            if ($notifId !== '') {
                $db->updateDocument('notifications', $notifId, ['is_read' => true]);
            }
            return ['marked' => true];
        })(),

        default => throw new InvalidArgumentException("Unknown API action: '{$action}'"),
    };

    echo json_encode([
        'ok' => true,
        'data' => $response,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
    if (http_response_code() === 200) {
        http_response_code(400);
    }
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    if (http_response_code() === 200) {
        http_response_code(500);
    }
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
