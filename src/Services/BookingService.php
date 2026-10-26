<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Database\FirestoreInterface;
use RuntimeException;

class BookingService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    public function getVipRoomsAndConfig(): array
    {
        $settings = $this->db->getDocument('settings', 'business_config') ?? [];
        $rooms = $this->db->queryDocuments('rooms', [
            ['field' => 'type', 'op' => '==', 'value' => 'vip'],
        ], 'room_number', 'ASC');

        $bookings = $this->db->queryDocuments('bookings', [], 'booking_date', 'ASC');
        $activeBookings = array_values(array_filter($bookings, static fn($b) => in_array($b['status'] ?? '', ['pending', 'confirmed'], true)));

        return [
            'vip_rooms' => $rooms,
            'allowed_durations_hours' => $settings['allowed_durations_hours'] ?? [1, 2, 3, 4, 6, 8],
            'opening_hours' => $settings['opening_hours'] ?? '10:00 - 02:00 WIB (Setiap Hari)',
            'currency_symbol' => $settings['currency_symbol'] ?? 'Rp ',
            'upcoming_bookings' => $activeBookings,
        ];
    }

    public function createVipBooking(array $user, array $input): array
    {
        $roomId = trim((string)($input['room_id'] ?? ''));
        $bookingDate = trim((string)($input['booking_date'] ?? ''));
        $startTime = trim((string)($input['start_time'] ?? ''));
        $durationHours = (int)($input['duration_hours'] ?? 0);
        $guestsCount = max(1, (int)($input['guests_count'] ?? 2));
        $notes = trim((string)($input['notes'] ?? ''));

        if ($roomId === '' || $bookingDate === '' || $startTime === '') {
            throw new InvalidArgumentException('Please select a VIP room, date, and start time.');
        }

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $bookingDate)) {
            throw new InvalidArgumentException('Invalid booking date format (expected YYYY-MM-DD).');
        }

        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $startTime)) {
            throw new InvalidArgumentException('Invalid start time format (expected HH:MM).');
        }

        $settings = $this->db->getDocument('settings', 'business_config') ?? [];
        $allowedDurations = $settings['allowed_durations_hours'] ?? [1, 2, 3, 4, 6, 8];
        if ($durationHours <= 0 || !in_array($durationHours, $allowedDurations, false)) {
            throw new InvalidArgumentException('Please select a valid rental duration (' . implode(', ', $allowedDurations) . ' hours).');
        }

        $today = date('Y-m-d');
        if ($bookingDate < $today) {
            throw new InvalidArgumentException('Booking date cannot be in the past.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use (
            $user,
            $roomId,
            $bookingDate,
            $startTime,
            $durationHours,
            $guestsCount,
            $notes
        ) {
            $room = $tx->getDocument('rooms', $roomId);
            if (!$room) {
                throw new InvalidArgumentException('Selected VIP room does not exist.');
            }
            if (($room['type'] ?? '') !== 'vip') {
                throw new InvalidArgumentException('Only VIP suites can be reserved through the VIP Booking system.');
            }
            if (in_array($room['status'] ?? '', ['maintenance', 'unavailable'], true)) {
                throw new RuntimeException('This VIP room is currently under maintenance and unavailable for booking.');
            }
            if ($guestsCount > (int)($room['max_players'] ?? 8)) {
                throw new InvalidArgumentException('Guest count exceeds room capacity (' . ($room['max_players'] ?? 8) . ' players max).');
            }

            $startMinutes = $this->timeToMinutes($startTime);
            $endMinutes = $startMinutes + ($durationHours * 60);
            $endTimeFormatted = $this->minutesToTime($endMinutes);

            // Conflict check against existing pending/confirmed bookings on the same date & room
            $existingBookings = $tx->queryDocuments('bookings', [
                ['field' => 'room_id', 'op' => '==', 'value' => $roomId],
                ['field' => 'booking_date', 'op' => '==', 'value' => $bookingDate],
            ]);

            foreach ($existingBookings as $eb) {
                $status = $eb['status'] ?? '';
                if (!in_array($status, ['pending', 'confirmed'], true)) {
                    continue;
                }
                $ebStart = $this->timeToMinutes((string)($eb['start_time'] ?? '00:00'));
                $ebDur = (int)($eb['duration_hours'] ?? 1);
                $ebEnd = $ebStart + ($ebDur * 60);

                // Overlap check: [startMinutes, endMinutes) overlaps [ebStart, ebEnd)
                if ($startMinutes < $ebEnd && $endMinutes > $ebStart) {
                    throw new RuntimeException(sprintf(
                        'Time slot conflict: %s is already booked on %s from %s to %s (%s). Please choose a different time or suite.',
                        $room['name'],
                        $bookingDate,
                        $eb['start_time'],
                        $eb['end_time'],
                        strtoupper($status)
                    ));
                }
            }

            $rate = (float)($room['rate_per_hour'] ?? ($settings['vip_default_rate'] ?? 50000));
            $totalPrice = round($rate * $durationHours, 2);

            $booking = $tx->createDocument('bookings', [
                'room_id' => $roomId,
                'room_name' => $room['name'],
                'user_id' => $user['id'],
                'customer_name' => $user['name'],
                'booking_date' => $bookingDate,
                'start_time' => $startTime,
                'end_time' => $endTimeFormatted,
                'duration_hours' => $durationHours,
                'rate_per_hour' => $rate,
                'total_price' => $totalPrice,
                'guests_count' => $guestsCount,
                'notes' => $notes,
                'status' => 'pending',
                'is_demo' => false,
            ]);

            $tx->createDocument('notifications', [
                'user_id' => $user['id'],
                'role_target' => 'admin',
                'title' => 'New VIP Booking Request',
                'message' => sprintf(
                    '%s requested %s on %s (%s - %s, %d hrs, Rp %s).',
                    $user['name'],
                    $room['name'],
                    $bookingDate,
                    $startTime,
                    $endTimeFormatted,
                    $durationHours,
                    number_format($totalPrice, 0, ',', '.')
                ),
                'type' => 'info',
                'is_read' => false,
            ]);

            return $booking;
        });
    }

    public function listBookings(?array $user = null): array
    {
        $isAdmin = ($user['role'] ?? '') === 'admin';
        if ($isAdmin) {
            return $this->db->queryDocuments('bookings', [], 'created_at', 'DESC');
        }
        if ($user === null) {
            return [];
        }
        return $this->db->queryDocuments('bookings', [
            ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
        ], 'created_at', 'DESC');
    }

    public function updateBookingStatus(string $bookingId, string $newStatus, array $actor): array
    {
        $newStatus = strtolower(trim($newStatus));
        if (!in_array($newStatus, ['pending', 'confirmed', 'cancelled', 'completed'], true)) {
            throw new InvalidArgumentException('Invalid booking status.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($bookingId, $newStatus, $actor) {
            $booking = $tx->getDocument('bookings', $bookingId);
            if (!$booking) {
                throw new InvalidArgumentException('Booking not found.');
            }

            $isAdmin = ($actor['role'] ?? '') === 'admin';
            $isOwner = ($booking['user_id'] ?? '') === ($actor['id'] ?? '');

            if (!$isAdmin) {
                if (!$isOwner || $newStatus !== 'cancelled' || ($booking['status'] ?? '') !== 'pending') {
                    throw new RuntimeException('Customers can only cancel their own pending bookings.');
                }
            }

            // If approving to 'confirmed', re-verify no other confirmed booking overlaps
            if ($newStatus === 'confirmed') {
                $startMinutes = $this->timeToMinutes((string)$booking['start_time']);
                $endMinutes = $startMinutes + (((int)$booking['duration_hours']) * 60);

                $sameDay = $tx->queryDocuments('bookings', [
                    ['field' => 'room_id', 'op' => '==', 'value' => $booking['room_id']],
                    ['field' => 'booking_date', 'op' => '==', 'value' => $booking['booking_date']],
                ]);
                foreach ($sameDay as $other) {
                    if ($other['id'] === $bookingId || ($other['status'] ?? '') !== 'confirmed') {
                        continue;
                    }
                    $oStart = $this->timeToMinutes((string)$other['start_time']);
                    $oEnd = $oStart + (((int)$other['duration_hours']) * 60);
                    if ($startMinutes < $oEnd && $endMinutes > $oStart) {
                        throw new RuntimeException('Cannot confirm: overlaps with another confirmed booking (' . $other['start_time'] . ' - ' . $other['end_time'] . ').');
                    }
                }
            }

            $updated = $tx->updateDocument('bookings', $bookingId, [
                'status' => $newStatus,
            ]);

            // Notify customer of status change
            if ($isAdmin && !empty($booking['user_id'])) {
                $tx->createDocument('notifications', [
                    'user_id' => $booking['user_id'],
                    'role_target' => 'customer',
                    'title' => 'VIP Booking ' . ucfirst($newStatus),
                    'message' => sprintf(
                        'Your VIP booking for %s on %s (%s) is now %s.',
                        $booking['room_name'] ?? $booking['room_id'],
                        $booking['booking_date'],
                        $booking['start_time'],
                        strtoupper($newStatus)
                    ),
                    'type' => $newStatus === 'confirmed' ? 'success' : 'info',
                    'is_read' => false,
                ]);
            }

            return $updated ?? $booking;
        });
    }

    private function timeToMinutes(string $hhmm): int
    {
        $parts = explode(':', $hhmm);
        return ((int)($parts[0] ?? 0)) * 60 + ((int)($parts[1] ?? 0));
    }

    private function minutesToTime(int $totalMinutes): string
    {
        $normalized = $totalMinutes % 1440;
        $h = intdiv($normalized, 60);
        $m = $normalized % 60;
        return sprintf('%02d:%02d', $h, $m);
    }
}
