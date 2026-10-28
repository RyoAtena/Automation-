<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Database\FirestoreInterface;
use RuntimeException;

class OrderService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    public function getMenu(bool $includeInactive = false): array
    {
        $settings = $this->db->getDocument('settings', 'business_config') ?? [];
        $threshold = (int)($settings['low_stock_threshold'] ?? 5);

        $items = $this->db->queryDocuments('menu_items', [], 'category', 'ASC');
        $filtered = [];
        $lowStockItems = [];

        foreach ($items as $item) {
            $active = (bool)($item['is_active'] ?? true);
            if (!$includeInactive && !$active) {
                continue;
            }
            $stock = (int)($item['stock'] ?? 0);
            $item['is_low_stock'] = $stock > 0 && $stock <= $threshold;
            $item['is_out_of_stock'] = $stock <= 0;
            $filtered[] = $item;

            if ($active && $stock <= $threshold) {
                $lowStockItems[] = [
                    'id' => $item['id'],
                    'name' => $item['name'],
                    'stock' => $stock,
                ];
            }
        }

        return [
            'menu_items' => $filtered,
            'low_stock_threshold' => $threshold,
            'low_stock_warnings' => $lowStockItems,
        ];
    }

    /**
     * Customer (or QR Table Guest): Submit a food & beverage order linked to their room or session.
     * Atomically verifies stock, deducts stock, logs `inventory_movements`, and records a financial transaction.
     */
    public function createOrder(?array $user, array $input): array
    {
        $cartItems = $input['items'] ?? [];
        $roomId = trim((string)($input['room_id'] ?? ''));
        $notes = trim((string)($input['notes'] ?? ''));
        $paymentMethod = trim((string)($input['payment_method'] ?? 'QRIS / E-Wallet'));
        $orderSource = trim((string)($input['order_source'] ?? 'portal'));
        $guestName = trim((string)($input['customer_name'] ?? ''));

        $actorId = $user['id'] ?? 'qr_guest';
        $customerName = $user['name'] ?? ($guestName !== '' ? $guestName : 'Pelanggan QR Meja');

        if (!is_array($cartItems) || empty($cartItems)) {
            throw new InvalidArgumentException('Keranjang pesanan masih kosong. Silakan pilih menu terlebih dahulu.');
        }

        $settings = $this->db->getDocument('settings', 'business_config') ?? [];
        $lowThreshold = (int)($settings['low_stock_threshold'] ?? 5);

        return $this->db->runTransaction(function (FirestoreInterface $tx) use (
            $user,
            $actorId,
            $customerName,
            $cartItems,
            $roomId,
            $notes,
            $paymentMethod,
            $orderSource,
            $lowThreshold
        ) {
            $roomNumber = 'Meja / Counter';
            $sessionId = null;

            if ($roomId !== '') {
                $room = $tx->getDocument('rooms', $roomId);
                if ($room) {
                    $roomNumber = (string)($room['room_number'] ?? $room['name']);
                    $sessionId = $room['current_session_id'] ?? null;
                }
            } elseif ($user !== null) {
                // Auto-detect if customer currently has an active session in any room
                $userSessions = $tx->queryDocuments('sessions', [
                    ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
                ]);
                foreach ($userSessions as $us) {
                    if (in_array($us['status'] ?? '', ['active', 'expired'], true)) {
                        $roomId = (string)$us['room_id'];
                        $sessionId = (string)$us['id'];
                        $roomDoc = $tx->getDocument('rooms', $roomId);
                        $roomNumber = (string)($roomDoc['room_number'] ?? $us['room_name'] ?? $roomId);
                        break;
                    }
                }
            }

            $orderLines = [];
            $totalAmount = 0.0;
            $stockUpdates = [];

            foreach ($cartItems as $line) {
                $itemId = trim((string)($line['item_id'] ?? ($line['id'] ?? '')));
                $qty = (int)($line['quantity'] ?? 0);
                if ($itemId === '' || $qty <= 0) {
                    throw new InvalidArgumentException('Item atau jumlah pesanan tidak valid.');
                }

                $menuItem = $tx->getDocument('menu_items', $itemId);
                if (!$menuItem || empty($menuItem['is_active'])) {
                    throw new RuntimeException("Menu '{$itemId}' sedang tidak tersedia.");
                }

                $currentStock = (int)($menuItem['stock'] ?? 0);
                if ($currentStock < $qty) {
                    throw new RuntimeException(sprintf(
                        'Insufficient stock for "%s" (Requested: %d, Available: %d).',
                        $menuItem['name'],
                        $qty,
                        $currentStock
                    ));
                }

                $price = (float)($menuItem['price'] ?? 0);
                $subtotal = round($price * $qty, 2);
                $totalAmount = round($totalAmount + $subtotal, 2);

                $orderLines[] = [
                    'item_id' => $itemId,
                    'name' => $menuItem['name'],
                    'price' => $price,
                    'quantity' => $qty,
                    'subtotal' => $subtotal,
                ];

                $stockUpdates[] = [
                    'item' => $menuItem,
                    'qty' => $qty,
                    'new_stock' => $currentStock - $qty,
                ];
            }

            $paymentStatus = in_array(strtolower($paymentMethod), ['kasir', 'cash', 'room tab'], true)
                ? 'Bayar di Kasir'
                : 'Lunas (Digital)';

            $orderDoc = $tx->createDocument('orders', [
                'user_id' => $actorId,
                'customer_name' => $customerName,
                'room_id' => $roomId ?: null,
                'room_number' => $roomNumber,
                'session_id' => $sessionId,
                'items' => $orderLines,
                'total_amount' => $totalAmount,
                'status' => 'Accepted', // Masuk otomatis ke Dashboard Dapur/Barista
                'stock_deducted' => true,
                'payment_method' => $paymentMethod,
                'payment_status' => $paymentStatus,
                'order_source' => $orderSource,
                'notes' => $notes,
                'is_demo' => false,
            ]);

            // Deduct stock and record audit logs in `inventory_movements`
            foreach ($stockUpdates as $su) {
                $item = $su['item'];
                $newStock = $su['new_stock'];
                $prevStock = (int)$item['stock'];

                $tx->updateDocument('menu_items', $item['id'], [
                    'stock' => $newStock,
                ]);

                $tx->createDocument('inventory_movements', [
                    'item_id' => $item['id'],
                    'item_name' => $item['name'],
                    'change_qty' => -$su['qty'],
                    'previous_stock' => $prevStock,
                    'new_stock' => $newStock,
                    'reason' => 'Order Confirmed (' . $orderDoc['id'] . ')',
                    'actor_id' => $actorId,
                ]);

                if ($newStock <= $lowThreshold) {
                    $tx->createDocument('notifications', [
                        'user_id' => $actorId,
                        'role_target' => 'admin',
                        'title' => 'Low Stock Alert: ' . $item['name'],
                        'message' => sprintf('Stok "%s" tersisa %d unit (batas minimum: %d). Segera isi ulang.', $item['name'], $newStock, $lowThreshold),
                        'type' => 'warning',
                        'is_read' => false,
                    ]);
                }
            }

            // Notify kitchen/barista & admin
            $tx->createDocument('notifications', [
                'user_id' => $actorId,
                'role_target' => 'admin',
                'title' => 'Pesanan Dapur/Barista Baru #' . $orderDoc['id'],
                'message' => sprintf('Pesanan baru dari %s (Ruangan/Meja: %s) senilai Rp %s via %s.', $customerName, $roomNumber, number_format($totalAmount, 0, ',', '.'), $paymentMethod),
                'type' => 'info',
                'is_read' => false,
            ]);

            // Record F&B financial transaction
            $tx->createDocument('transactions', [
                'type' => 'fnb',
                'reference_id' => $orderDoc['id'],
                'user_id' => $actorId,
                'customer_name' => $customerName,
                'room_id' => $roomId ?: null,
                'description' => sprintf('F&B Order #%s (%s)', $orderDoc['id'], $roomNumber),
                'amount' => $totalAmount,
                'payment_method' => $paymentMethod,
                'is_demo' => false,
                'transaction_date' => date('Y-m-d'),
            ]);

            return $orderDoc;
        });
    }

    /**
     * Admin (or Customer cancelling Pending/Accepted): Update order status.
     * Automatically restores stock if an order with `stock_deducted: true` is Cancelled!
     */
    public function updateOrderStatus(string $orderId, string $newStatus, array $actor): array
    {
        $validStatuses = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Delivered', 'Cancelled'];
        $matchedStatus = null;
        foreach ($validStatuses as $vs) {
            if (strcasecmp($vs, trim($newStatus)) === 0) {
                $matchedStatus = $vs;
                break;
            }
        }
        if ($matchedStatus === null) {
            throw new InvalidArgumentException('Invalid order status. Allowed: ' . implode(', ', $validStatuses));
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($orderId, $matchedStatus, $actor) {
            $order = $tx->getDocument('orders', $orderId);
            if (!$order) {
                throw new InvalidArgumentException('Order not found.');
            }

            $isAdmin = ($actor['role'] ?? '') === 'admin';
            if (!$isAdmin) {
                if (($order['user_id'] ?? '') !== ($actor['id'] ?? '') || $matchedStatus !== 'Cancelled') {
                    throw new RuntimeException('Customers can only cancel their own orders before preparation completes.');
                }
                if (in_array($order['status'] ?? '', ['Ready', 'Delivered', 'Cancelled'], true)) {
                    throw new RuntimeException('Order can no longer be cancelled because it is ' . $order['status'] . '.');
                }
            }

            $stockDeducted = (bool)($order['stock_deducted'] ?? false);

            // Restore stock if cancelling an order whose stock was already deducted
            if ($matchedStatus === 'Cancelled' && $stockDeducted) {
                foreach ($order['items'] ?? [] as $line) {
                    $itemId = (string)($line['item_id'] ?? '');
                    $qty = (int)($line['quantity'] ?? 0);
                    if ($itemId !== '' && $qty > 0) {
                        $menuItem = $tx->getDocument('menu_items', $itemId);
                        if ($menuItem) {
                            $prevStock = (int)($menuItem['stock'] ?? 0);
                            $newStock = $prevStock + $qty;
                            $tx->updateDocument('menu_items', $itemId, [
                                'stock' => $newStock,
                            ]);
                            $tx->createDocument('inventory_movements', [
                                'item_id' => $itemId,
                                'item_name' => $menuItem['name'],
                                'change_qty' => $qty,
                                'previous_stock' => $prevStock,
                                'new_stock' => $newStock,
                                'reason' => 'Order Cancelled - Stock Restored (' . $orderId . ')',
                                'actor_id' => $actor['id'] ?? 'admin',
                            ]);
                        }
                    }
                }
                $stockDeducted = false;

                // Remove corresponding financial transaction so cancelled orders don't inflate revenue
                $txs = $tx->queryDocuments('transactions', [
                    ['field' => 'reference_id', 'op' => '==', 'value' => $orderId],
                ]);
                foreach ($txs as $tDoc) {
                    $tx->deleteDocument('transactions', $tDoc['id']);
                }
            }

            $updated = $tx->updateDocument('orders', $orderId, [
                'status' => $matchedStatus,
                'stock_deducted' => $stockDeducted,
            ]);

            if (!empty($order['user_id'])) {
                $tx->createDocument('notifications', [
                    'user_id' => $order['user_id'],
                    'role_target' => 'customer',
                    'title' => 'Order #' . $orderId . ' is ' . $matchedStatus,
                    'message' => sprintf('Your F&B order (%s) status is now: %s.', $order['room_number'] ?? 'Counter', $matchedStatus),
                    'type' => $matchedStatus === 'Cancelled' ? 'warning' : 'info',
                    'is_read' => false,
                ]);
            }

            return $updated ?? $order;
        });
    }

    public function listOrders(?array $user = null): array
    {
        $isAdmin = ($user['role'] ?? '') === 'admin';
        if ($isAdmin) {
            return $this->db->queryDocuments('orders', [], 'created_at', 'DESC');
        }
        if ($user === null) {
            return [];
        }
        return $this->db->queryDocuments('orders', [
            ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
        ], 'created_at', 'DESC');
    }

    /**
     * Admin: Add, edit, or restock a menu item and log inventory changes.
     */
    public function saveMenuItem(array $input, array $admin): array
    {
        $itemId = trim((string)($input['id'] ?? ''));
        $name = trim((string)($input['name'] ?? ''));
        $category = trim((string)($input['category'] ?? 'Snacks & Bites'));
        $price = (float)($input['price'] ?? 0);
        $costPrice = (float)($input['cost_price'] ?? round($price * 0.35, 2));
        $stock = (int)($input['stock'] ?? 0);
        $isActive = isset($input['is_active']) ? (bool)$input['is_active'] : true;
        $imageUrl = trim((string)($input['image_url'] ?? ''));
        $description = trim((string)($input['description'] ?? ''));
        $reason = trim((string)($input['stock_reason'] ?? 'Admin Inventory Update'));

        if ($name === '') {
            throw new InvalidArgumentException('Menu item name is required.');
        }
        if ($price <= 0) {
            throw new InvalidArgumentException('Price must be greater than zero.');
        }
        if ($stock < 0) {
            throw new InvalidArgumentException('Stock cannot be negative.');
        }
        if ($imageUrl === '') {
            $imageUrl = 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80';
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use (
            $itemId,
            $name,
            $category,
            $price,
            $costPrice,
            $stock,
            $isActive,
            $imageUrl,
            $description,
            $reason,
            $admin
        ) {
            if ($itemId === '') {
                $itemId = 'menu_' . preg_replace('/[^a-z0-9]+/i', '_', strtolower($name)) . '_' . random_int(10, 99);
            }
            $existing = $tx->getDocument('menu_items', $itemId);
            $prevStock = $existing ? (int)($existing['stock'] ?? 0) : 0;

            $saved = $tx->setDocument('menu_items', $itemId, [
                'id' => $itemId,
                'name' => $name,
                'category' => $category,
                'price' => round($price, 2),
                'cost_price' => round($costPrice, 2),
                'stock' => $stock,
                'is_active' => $isActive,
                'image_url' => $imageUrl,
                'description' => $description,
            ], true);

            if ($existing === null || $prevStock !== $stock) {
                $tx->createDocument('inventory_movements', [
                    'item_id' => $itemId,
                    'item_name' => $name,
                    'change_qty' => $stock - $prevStock,
                    'previous_stock' => $prevStock,
                    'new_stock' => $stock,
                    'reason' => $existing === null ? 'Initial Menu Item Stock' : $reason,
                    'actor_id' => $admin['id'] ?? 'admin',
                ]);
            }

            return $saved;
        });
    }

    public function getInventoryMovements(int $limit = 100): array
    {
        return $this->db->queryDocuments('inventory_movements', [], 'created_at', 'DESC', $limit);
    }
}
