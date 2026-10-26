<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Database\FirestoreInterface;

class FinanceService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    public function getFinancialReport(array $params = []): array
    {
        $startDate = trim((string)($params['start_date'] ?? ''));
        $endDate = trim((string)($params['end_date'] ?? ''));
        $period = strtolower(trim((string)($params['period'] ?? 'all'))); // daily | weekly | monthly | all
        $includeDemo = !isset($params['include_demo']) || filter_var($params['include_demo'], FILTER_VALIDATE_BOOLEAN);

        $now = time();
        if ($startDate === '' && $endDate === '') {
            if ($period === 'daily') {
                $startDate = date('Y-m-d', $now);
                $endDate = $startDate;
            } elseif ($period === 'weekly') {
                $startDate = date('Y-m-d', $now - (7 * 86400));
                $endDate = date('Y-m-d', $now);
            } elseif ($period === 'monthly') {
                $startDate = date('Y-m-d', $now - (30 * 86400));
                $endDate = date('Y-m-d', $now);
            }
        }

        $allTransactions = $this->db->queryDocuments('transactions', [], 'created_at', 'DESC');
        $allExpenses = $this->db->queryDocuments('expenses', [], 'created_at', 'DESC');
        $allSessions = $this->db->queryDocuments('sessions');
        $allBookings = $this->db->queryDocuments('bookings');
        $allOrders = $this->db->queryDocuments('orders');
        $allRooms = $this->db->queryDocuments('rooms');
        $allGames = $this->db->queryDocuments('games', [], 'play_count', 'DESC');

        $roomsById = [];
        foreach ($allRooms as $r) {
            $roomsById[$r['id']] = $r['name'] ?? $r['id'];
        }

        $filteredTx = [];
        $rentalRevenue = 0.0;
        $fnbRevenue = 0.0;
        $demoTxCount = 0;
        $liveTxCount = 0;
        $roomUsageCounts = [];
        $dailyBreakdown = [];

        foreach ($allTransactions as $tx) {
            $isDemo = (bool)($tx['is_demo'] ?? false);
            if ($isDemo) {
                $demoTxCount++;
            } else {
                $liveTxCount++;
            }
            if (!$includeDemo && $isDemo) {
                continue;
            }

            $txDate = substr((string)($tx['transaction_date'] ?? ($tx['created_at'] ?? '')), 0, 10);
            if ($startDate !== '' && $txDate < $startDate) {
                continue;
            }
            if ($endDate !== '' && $txDate > $endDate) {
                continue;
            }

            $amt = (float)($tx['amount'] ?? 0);
            $type = $tx['type'] ?? 'rental';
            if ($type === 'fnb') {
                $fnbRevenue = round($fnbRevenue + $amt, 2);
            } else {
                $rentalRevenue = round($rentalRevenue + $amt, 2);
            }

            if (!empty($tx['room_id'])) {
                $rId = (string)$tx['room_id'];
                $roomUsageCounts[$rId] = ($roomUsageCounts[$rId] ?? 0) + 1;
            }

            if ($txDate !== '') {
                if (!isset($dailyBreakdown[$txDate])) {
                    $dailyBreakdown[$txDate] = ['date' => $txDate, 'rental' => 0.0, 'fnb' => 0.0, 'expenses' => 0.0, 'profit' => 0.0];
                }
                if ($type === 'fnb') {
                    $dailyBreakdown[$txDate]['fnb'] = round($dailyBreakdown[$txDate]['fnb'] + $amt, 2);
                } else {
                    $dailyBreakdown[$txDate]['rental'] = round($dailyBreakdown[$txDate]['rental'] + $amt, 2);
                }
            }

            $filteredTx[] = $tx;
        }

        $filteredExpenses = [];
        $totalExpenses = 0.0;

        foreach ($allExpenses as $exp) {
            $isDemo = (bool)($exp['is_demo'] ?? false);
            if (!$includeDemo && $isDemo) {
                continue;
            }
            $expDate = substr((string)($exp['expense_date'] ?? ($exp['created_at'] ?? '')), 0, 10);
            if ($startDate !== '' && $expDate < $startDate) {
                continue;
            }
            if ($endDate !== '' && $expDate > $endDate) {
                continue;
            }

            $amt = (float)($exp['amount'] ?? 0);
            $totalExpenses = round($totalExpenses + $amt, 2);
            if ($expDate !== '') {
                if (!isset($dailyBreakdown[$expDate])) {
                    $dailyBreakdown[$expDate] = ['date' => $expDate, 'rental' => 0.0, 'fnb' => 0.0, 'expenses' => 0.0, 'profit' => 0.0];
                }
                $dailyBreakdown[$expDate]['expenses'] = round($dailyBreakdown[$expDate]['expenses'] + $amt, 2);
            }
            $filteredExpenses[] = $exp;
        }

        foreach ($dailyBreakdown as $dt => &$row) {
            $row['profit'] = round(($row['rental'] + $row['fnb']) - $row['expenses'], 2);
        }
        unset($row);
        krsort($dailyBreakdown);

        $totalRevenue = round($rentalRevenue + $fnbRevenue, 2);
        $estimatedProfit = round($totalRevenue - $totalExpenses, 2);

        // Completed sessions count
        $completedSessionsCount = 0;
        foreach ($allSessions as $s) {
            if (!$includeDemo && !empty($s['is_demo'])) {
                continue;
            }
            if (($s['status'] ?? '') === 'completed') {
                $completedSessionsCount++;
            }
            if (!empty($s['room_id'])) {
                $rId = (string)$s['room_id'];
                $roomUsageCounts[$rId] = ($roomUsageCounts[$rId] ?? 0) + 1;
            }
        }

        // Bookings count
        $bookingsCount = 0;
        foreach ($allBookings as $b) {
            if (!$includeDemo && !empty($b['is_demo'])) {
                continue;
            }
            $bookingsCount++;
        }

        // Most frequently used rooms
        arsort($roomUsageCounts);
        $topRooms = [];
        foreach ($roomUsageCounts as $rId => $cnt) {
            $topRooms[] = [
                'room_id' => $rId,
                'room_name' => $roomsById[$rId] ?? $rId,
                'usage_count' => $cnt,
            ];
        }

        // Best-selling food and drinks
        $itemSales = [];
        foreach ($allOrders as $ord) {
            if (!$includeDemo && !empty($ord['is_demo'])) {
                continue;
            }
            if (($ord['status'] ?? '') === 'Cancelled') {
                continue;
            }
            foreach ($ord['items'] ?? [] as $line) {
                $id = $line['item_id'] ?? $line['name'];
                if (!isset($itemSales[$id])) {
                    $itemSales[$id] = [
                        'item_id' => $id,
                        'name' => $line['name'] ?? $id,
                        'qty_sold' => 0,
                        'revenue' => 0.0,
                    ];
                }
                $itemSales[$id]['qty_sold'] += (int)($line['quantity'] ?? 0);
                $itemSales[$id]['revenue'] = round($itemSales[$id]['revenue'] + (float)($line['subtotal'] ?? 0), 2);
            }
        }
        usort($itemSales, static fn($a, $b) => $b['qty_sold'] <=> $a['qty_sold']);

        // Popular games
        $topGames = array_map(static fn($g) => [
            'id' => $g['id'],
            'title' => $g['title'],
            'platform' => $g['platform'],
            'play_count' => (int)($g['play_count'] ?? 0),
        ], array_slice($allGames, 0, 6));

        return [
            'summary' => [
                'rental_revenue' => $rentalRevenue,
                'fnb_revenue' => $fnbRevenue,
                'total_revenue' => $totalRevenue,
                'operating_expenses' => $totalExpenses,
                'estimated_profit' => $estimatedProfit,
                'completed_sessions_count' => $completedSessionsCount,
                'total_bookings_count' => $bookingsCount,
                'include_demo' => $includeDemo,
                'demo_transactions_count' => $demoTxCount,
                'live_transactions_count' => $liveTxCount,
            ],
            'top_rooms' => array_slice($topRooms, 0, 5),
            'best_selling_fnb' => array_slice($itemSales, 0, 5),
            'popular_games' => $topGames,
            'daily_breakdown' => array_values($dailyBreakdown),
            'transactions' => $filteredTx,
            'expenses' => $filteredExpenses,
        ];
    }

    public function addExpense(array $input, array $admin): array
    {
        $category = trim((string)($input['category'] ?? 'General Operations'));
        $description = trim((string)($input['description'] ?? ''));
        $amount = (float)($input['amount'] ?? 0);
        $expenseDate = trim((string)($input['expense_date'] ?? date('Y-m-d')));

        if ($description === '') {
            throw new InvalidArgumentException('Expense description is required.');
        }
        if ($amount <= 0) {
            throw new InvalidArgumentException('Expense amount must be greater than zero.');
        }

        return $this->db->createDocument('expenses', [
            'category' => $category,
            'description' => $description,
            'amount' => round($amount, 2),
            'expense_date' => $expenseDate,
            'recorded_by' => $admin['id'] ?? 'admin',
            'is_demo' => false,
        ]);
    }

    public function deleteExpense(string $expenseId): bool
    {
        return $this->db->deleteDocument('expenses', $expenseId);
    }

    public function exportTransactionsCsv(array $params = []): string
    {
        $report = $this->getFinancialReport($params);
        $fh = fopen('php://temp', 'r+');

        fputcsv($fh, ['Entry Type', 'ID', 'Date', 'Category / Stream', 'Customer / Vendor', 'Description', 'Payment Method', 'Revenue (+)', 'Expense (-)', 'Net Impact', 'Record Source']);

        foreach ($report['transactions'] as $tx) {
            $amt = (float)($tx['amount'] ?? 0);
            fputcsv($fh, [
                'REVENUE',
                $tx['id'] ?? '',
                $tx['transaction_date'] ?? substr((string)($tx['created_at'] ?? ''), 0, 10),
                strtoupper((string)($tx['type'] ?? 'rental')),
                $tx['customer_name'] ?? 'Customer',
                $tx['description'] ?? '',
                $tx['payment_method'] ?? 'Cash',
                number_format($amt, 2, '.', ''),
                '0.00',
                number_format($amt, 2, '.', ''),
                !empty($tx['is_demo']) ? 'DEMO SEED' : 'LIVE TRANSACTION',
            ]);
        }

        foreach ($report['expenses'] as $exp) {
            $amt = (float)($exp['amount'] ?? 0);
            fputcsv($fh, [
                'EXPENSE',
                $exp['id'] ?? '',
                $exp['expense_date'] ?? substr((string)($exp['created_at'] ?? ''), 0, 10),
                $exp['category'] ?? 'Operating Expense',
                'Internal / Vendor',
                $exp['description'] ?? '',
                'Company Account',
                '0.00',
                number_format($amt, 2, '.', ''),
                number_format(-$amt, 2, '.', ''),
                !empty($exp['is_demo']) ? 'DEMO SEED' : 'LIVE EXPENSE',
            ]);
        }

        // Summary footer row
        fputcsv($fh, []);
        fputcsv($fh, [
            'SUMMARY TOTALS',
            '',
            date('Y-m-d'),
            'ALL',
            '',
            'Total Revenue vs Operating Costs & Estimated Profit',
            '',
            number_format((float)$report['summary']['total_revenue'], 2, '.', ''),
            number_format((float)$report['summary']['operating_expenses'], 2, '.', ''),
            number_format((float)$report['summary']['estimated_profit'], 2, '.', ''),
            '',
        ]);

        rewind($fh);
        $csv = (string)stream_get_contents($fh);
        fclose($fh);
        return $csv;
    }
}
