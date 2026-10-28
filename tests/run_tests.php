<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use Nexus\Database\FirestoreRepository;
use Nexus\Database\Seeder;
use Nexus\Services\AuthService;
use Nexus\Services\BookingService;
use Nexus\Services\CatalogService;
use Nexus\Services\FeedbackService;
use Nexus\Services\FinanceService;
use Nexus\Services\OrderService;
use Nexus\Services\RoomQueueService;
use Nexus\Services\SupportService;

$testDbPath = dirname(__DIR__) . '/storage/test_suite.sqlite';
@unlink($testDbPath);
@unlink($testDbPath . '-wal');
@unlink($testDbPath . '-shm');

$db = FirestoreRepository::getInstance($testDbPath);
Seeder::seedAll($db);

$passed = 0;
$failed = 0;

function assertTrue(bool $cond, string $label): void
{
    global $passed, $failed;
    if ($cond) {
        $passed++;
        echo "  [PASS] {$label}\n";
    } else {
        $failed++;
        echo "  [FAIL] {$label}\n";
    }
}

function assertThrows(callable $fn, string $label): void
{
    global $passed, $failed;
    try {
        $fn();
        $failed++;
        echo "  [FAIL] {$label} (Expected exception, none thrown)\n";
    } catch (Throwable $e) {
        $passed++;
        echo "  [PASS] {$label} -> Caught: {$e->getMessage()}\n";
    }
}

echo "=================================================================\n";
echo " NEXUS ARENA — AUTOMATED INTEGRATION & DATA INTEGRITY TEST SUITE\n";
echo "=================================================================\n\n";

// -------------------------------------------------------------------------
// 1. INITIAL CLEAN STATE, DATABASE & AUTHENTICATION TESTS
// -------------------------------------------------------------------------
echo "1. Initial Zero-History State, Schema & Authentication:\n";
$fin = new FinanceService($db);
$initSummary = $fin->getFinancialReport()['summary'];
assertTrue(
    (float)$initSummary['total_revenue'] === 0.0 &&
    (float)$initSummary['operating_expenses'] === 0.0 &&
    (float)$initSummary['estimated_profit'] === 0.0,
    'Initial financial history starts cleanly at Rp 0 (Revenue: 0, Expenses: 0, Profit: 0)'
);

$auth = new AuthService($db);
$adminLogin = $auth->login('admin@nexusarena.gg', 'Admin@123');
assertTrue(($adminLogin['user']['role'] ?? '') === 'admin', 'Admin login succeeds and returns admin role');
assertTrue(!isset($adminLogin['user']['password_hash']), 'Password hash is stripped from returned user object');

$rawAdmin = $db->getDocument('users', 'usr_admin_1');
assertTrue(str_starts_with((string)$rawAdmin['password_hash'], '$2y$'), 'Passwords are stored as BCRYPT hashes, never plain text');

assertThrows(fn() => $auth->login('admin@nexusarena.gg', 'WrongPass'), 'Invalid password login is rejected');
assertThrows(fn() => $auth->register(['name' => 'A', 'email' => 'bad-email', 'password' => '123']), 'Invalid registration inputs are rejected');
assertThrows(fn() => $auth->register(['name' => 'Duplicate', 'email' => 'alex@gamer.gg', 'password' => 'Secret123']), 'Duplicate email registration is rejected');

$newCustReg = $auth->register([
    'name' => 'Test Player One',
    'email' => 'player1@nexusarena.gg',
    'phone' => '0812-9999-0000',
    'password' => 'PlayerPass123',
]);
$newCust = $newCustReg['user'];
assertTrue(($newCust['role'] ?? '') === 'customer', 'New registered user defaults strictly to customer role');

// -------------------------------------------------------------------------
// 2. ROOM MANAGEMENT, TIMERS & QUEUE SYSTEM
// -------------------------------------------------------------------------
echo "\n2. Room Management, Live Timers & Queue Promotion:\n";
$rq = new RoomQueueService($db);
$roomsState = $rq->getAllRoomsEnriched($adminLogin['user']);
assertTrue(count($roomsState['rooms']) === 6, 'All 6 seeded rooms returned with enriched metadata');
assertTrue((float)$db->getDocument('rooms', 'room_101')['rate_per_hour'] === 20000.0, 'Regular room rate is Rp 20.000/jam');
assertTrue((float)$db->getDocument('rooms', 'room_201')['rate_per_hour'] === 50000.0, 'VIP room rate is Rp 50.000/jam');

// Start session in available Room 101
$sess101 = $rq->startSession([
    'room_id' => 'room_101',
    'user_id' => 'usr_cust_1',
    'customer_name' => 'Alex Mercer',
    'duration_hours' => 2,
    'controllers_count' => 2,
    'game_id' => 'game_fc26',
]);
assertTrue((float)$sess101['total_amount'] === 40000.0, 'Regular Room 101 2-hour session total is Rp 40.000');

// Double session assignment on occupied Room 101 must fail
assertThrows(
    fn() => $rq->startSession(['room_id' => 'room_101', 'user_id' => $newCust['id'], 'duration_hours' => 1]),
    'Prevent starting a session in an already occupied room (Room 101)'
);

// Start session in available Room 102
$startedSess = $rq->startSession([
    'room_id' => 'room_102',
    'user_id' => $newCust['id'],
    'customer_name' => $newCust['name'],
    'duration_hours' => 2,
    'controllers_count' => 2,
    'game_id' => 'game_spiderman2',
]);
assertTrue(($startedSess['status'] ?? '') === 'active', 'Started new session in Room 102');
assertTrue($db->getDocument('rooms', 'room_102')['status'] === 'occupied', 'Room 102 status updated to occupied');
assertTrue($db->getDocument('controllers', 'ctrl_room_102')['available_controllers'] === 2, 'Room 102 available controllers deducted from 4 to 2');

// Simulate expired timer on Room 102 session and verify it marks 'expired' WITHOUT terminating room occupancy
$db->updateDocument('sessions', $startedSess['id'], ['end_timestamp' => time() - 30]);
$rq->syncSessionTimers();
$expiredSessDoc = $db->getDocument('sessions', $startedSess['id']);
$room102Doc = $db->getDocument('rooms', 'room_102');
assertTrue(($expiredSessDoc['status'] ?? '') === 'expired', 'Expired session automatically marked as expired');
assertTrue(($room102Doc['status'] ?? '') === 'occupied', 'Expired paid session is NOT auto-terminated without explicit admin action');

// Extend the expired session
$extendedSess = $rq->extendSession($startedSess['id'], 1.0, 'Cash');
assertTrue(($extendedSess['status'] ?? '') === 'active' && (float)$extendedSess['duration_hours'] === 3.0, 'Extending session restores active status and adds hours');

// Customer Ryan Reyes joins waiting queue, then Room 101 session ends -> Ryan is automatically notified!
$ryan = $db->getDocument('users', 'usr_cust_3');
$queueEntry = $rq->joinQueue($ryan, ['preferred_room_type' => 'regular', 'preferred_console' => 'PlayStation 5', 'party_size' => 2, 'requested_hours' => 2]);
$endRes = $rq->endOrCancelSession($sess101['id'], 'complete');
assertTrue(($endRes['session']['status'] ?? '') === 'completed', 'Ending session marks it completed');
assertTrue($db->getDocument('rooms', 'room_101')['status'] === 'available', 'Ending session marks Room 101 available');
assertTrue($db->getDocument('controllers', 'ctrl_room_101')['available_controllers'] === 4, 'Ending session releases assigned controllers back to available pool');
assertTrue(($endRes['next_queue_notified']['id'] ?? '') === $queueEntry['id'], 'Ending session automatically notifies next waiting customer in queue');

// -------------------------------------------------------------------------
// 3. VIP ROOM BOOKING & CONFLICT DETECTION
// -------------------------------------------------------------------------
echo "\n3. VIP Room Booking & Overlap Prevention:\n";
$bk = new BookingService($db);
$futureDate = date('Y-m-d', time() + (3 * 86400));

$vipBooking = $bk->createVipBooking($newCust, [
    'room_id' => 'room_201',
    'booking_date' => $futureDate,
    'start_time' => '16:00',
    'duration_hours' => 3,
    'guests_count' => 5,
    'notes' => 'VIP Clan Match',
]);
assertTrue((float)$vipBooking['total_price'] === 150000.0, 'VIP booking calculates total price automatically (Rp 50.000/jam * 3 jam = Rp 150.000)');

assertThrows(
    fn() => $bk->createVipBooking($newCust, [
        'room_id' => 'room_201',
        'booking_date' => $futureDate,
        'start_time' => '17:00',
        'duration_hours' => 2,
        'guests_count' => 4,
    ]),
    'Overlapping VIP booking on same room & date (17:00-19:00 vs 16:00-19:00) is rejected'
);

assertThrows(
    fn() => $bk->createVipBooking($newCust, [
        'room_id' => 'room_101',
        'booking_date' => $futureDate,
        'start_time' => '12:00',
        'duration_hours' => 2,
    ]),
    'Rejects VIP booking attempt on a non-VIP room'
);

// -------------------------------------------------------------------------
// 4. GAME CATALOG MAPPING & CONTROLLER INVENTORY
// -------------------------------------------------------------------------
echo "\n4. Game Catalog Mapping & Controller Inventory:\n";
$cat = new CatalogService($db);
$haloCatalog = $cat->getGamesCatalog(['search' => 'Halo Infinite'])['games'];
$haloRooms = array_column($haloCatalog[0]['available_rooms'] ?? [], 'id');
assertTrue($haloRooms === ['room_103', 'room_201'], 'Halo Infinite is mapped strictly to Room 103 & VIP 201 and not shown in other rooms');

// Request controllers in Room 102 (currently 2 available)
$ctrlReq = $cat->requestAdditionalControllers($newCust, [
    'room_id' => 'room_102',
    'quantity' => 2,
]);
$cat->handleControllerRequest($ctrlReq['id'], 'approved');
assertTrue($db->getDocument('controllers', 'ctrl_room_102')['available_controllers'] === 0, 'Controller approval atomically updates available controllers to 0');

assertThrows(
    fn() => $cat->requestAdditionalControllers($newCust, ['room_id' => 'room_102', 'quantity' => 1]),
    'Rejects controller request when 0 controllers are available in Room 102'
);

// -------------------------------------------------------------------------
// 5. FOOD & BEVERAGE ORDERING & ATOMIC STOCK MANAGEMENT
// -------------------------------------------------------------------------
echo "\n5. Food & Beverage Ordering & Atomic Stock Management:\n";
$ord = new OrderService($db);

assertThrows(
    fn() => $ord->createOrder($newCust, [
        'room_id' => 'room_102',
        'items' => [['item_id' => 'menu_nachos', 'quantity' => 99]],
    ]),
    'Rejects F&B order when requested quantity (99) exceeds stock (15)'
);

$stockBefore = (int)$db->getDocument('menu_items', 'menu_nachos')['stock'];
$createdOrder = $ord->createOrder($newCust, [
    'room_id' => 'room_102',
    'items' => [['item_id' => 'menu_nachos', 'quantity' => 3]],
]);
$stockAfterOrder = (int)$db->getDocument('menu_items', 'menu_nachos')['stock'];
assertTrue($stockAfterOrder === $stockBefore - 3, "Order confirmation atomically deducts stock ({$stockBefore} -> {$stockAfterOrder})");

// Cancel order and verify stock restoration
$ord->updateOrderStatus($createdOrder['id'], 'Cancelled', $adminLogin['user']);
$stockAfterCancel = (int)$db->getDocument('menu_items', 'menu_nachos')['stock'];
assertTrue($stockAfterCancel === $stockBefore, "Cancelling confirmed order restores stock ({$stockAfterOrder} -> {$stockAfterCancel})");

// Test QR Code Table / Walk-In Guest Order (without user account login)
$qrOrder = $ord->createOrder(null, [
    'room_id' => 'room_101',
    'customer_name' => 'Pelanggan QR Meja 101',
    'order_source' => 'qr_table',
    'payment_method' => 'QRIS',
    'items' => [['item_id' => 'menu_nachos', 'quantity' => 2]],
]);
assertTrue(
    ($qrOrder['order_source'] ?? '') === 'qr_table' &&
    ($qrOrder['payment_status'] ?? '') === 'Lunas (Digital)' &&
    in_array($qrOrder['status'] ?? '', ['Pending', 'Accepted'], true),
    'QR Table order succeeds without login, records digital payment status, and enters Kitchen Display System queue'
);

// -------------------------------------------------------------------------
// 6. FINANCIAL REPORTS, CHATBOT, SUPPORT CHAT & FEEDBACK
// -------------------------------------------------------------------------
echo "\n6. Financial Reports, AI Chatbot, Support Chat & Feedback:\n";
$fin->addExpense([
    'category' => 'Maintenance',
    'description' => 'Thumbstick replacement kit',
    'amount' => 25000,
    'expense_date' => date('Y-m-d'),
], $adminLogin['user']);

$liveReport = $fin->getFinancialReport(['include_demo' => false])['summary'];
assertTrue(
    $liveReport['estimated_profit'] === round($liveReport['total_revenue'] - $liveReport['operating_expenses'], 2),
    sprintf('Live Financial Report calculates Net Profit = Revenue (Rp %s) - Expenses (Rp %s) = Rp %s', number_format($liveReport['total_revenue'], 0, ',', '.'), number_format($liveReport['operating_expenses'], 0, ',', '.'), number_format($liveReport['estimated_profit'], 0, ',', '.'))
);

$csv = $fin->exportTransactionsCsv(['include_demo' => false]);
assertTrue(str_contains($csv, 'SUMMARY TOTALS') && str_contains($csv, 'Thumbstick replacement kit'), 'CSV export contains transactions, expenses, and summary totals');

$sup = new SupportService($db);
$botReply = $sup->askChatbot('What are the VIP booking rates?');
assertTrue(str_contains($botReply['reply'], '50.000') && $botReply['mode'] === 'live_db_faq_fallback', 'AI Chatbot answers VIP rates (Rp 50.000/jam) using live DB data');

$custMsg = $sup->sendSupportMessage($newCust, ['message' => 'Can I get help with HDMI in Room 102?']);
$supStateAdmin = $sup->getSupportState($adminLogin['user'], $custMsg['conversation_id']);
assertTrue(count($supStateAdmin['messages']) === 1, 'Human support chat persists customer messages and links conversation');

$fb = new FeedbackService($db);
$fbDoc = $fb->submitFeedback($newCust, [
    'session_id' => $startedSess['id'],
    'rating' => 5,
    'category' => 'review',
    'comment' => 'Spider-Man 2 on 120Hz OLED was super smooth!',
]);
assertTrue($fbDoc['customer_display_name'] === 'Test P.', 'Public review masks full customer name to privacy-safe format (Test P.)');

assertThrows(
    fn() => $fb->submitFeedback($newCust, [
        'session_id' => $startedSess['id'],
        'rating' => 4,
        'category' => 'review',
        'comment' => 'Second review for same session',
    ]),
    'Prevents duplicate review for the same session'
);

// Admin enables review correction (`allow_resubmit: true`) and customer updates review
$fb->respondToFeedback($fbDoc['id'], ['admin_response' => 'Thanks!', 'allow_resubmit' => true]);
$updatedFb = $fb->submitFeedback($newCust, [
    'session_id' => $startedSess['id'],
    'rating' => 5,
    'category' => 'review',
    'comment' => 'Updated review after admin-approved correction!',
]);
assertTrue($updatedFb['comment'] === 'Updated review after admin-approved correction!', 'Admin-approved review correction allows updating session feedback');

@unlink($testDbPath);
@unlink($testDbPath . '-wal');
@unlink($testDbPath . '-shm');

echo "\n=================================================================\n";
echo " TEST SUMMARY: {$passed} PASSED, {$failed} FAILED\n";
echo "=================================================================\n";

exit($failed > 0 ? 1 : 0);
