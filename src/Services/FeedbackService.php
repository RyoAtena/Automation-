<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Database\FirestoreInterface;
use RuntimeException;

class FeedbackService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    public function getFeedbackSummary(?array $user = null): array
    {
        $isAdmin = ($user['role'] ?? '') === 'admin';
        $allFeedback = $this->db->queryDocuments('feedback', [], 'created_at', 'DESC');

        $totalRating = 0;
        $ratedCount = 0;
        $starsBreakdown = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];
        $categoryCounts = ['review' => 0, 'complaint' => 0, 'suggestion' => 0];

        $list = [];
        foreach ($allFeedback as $fb) {
            $rating = max(1, min(5, (int)($fb['rating'] ?? 5)));
            $cat = strtolower((string)($fb['category'] ?? 'review'));

            $totalRating += $rating;
            $ratedCount++;
            $starsBreakdown[$rating] = ($starsBreakdown[$rating] ?? 0) + 1;
            $categoryCounts[$cat] = ($categoryCounts[$cat] ?? 0) + 1;

            if (!$isAdmin) {
                $isOwn = $user !== null && ($fb['user_id'] ?? '') === ($user['id'] ?? '');
                // Never expose private user_id or private complaints of other users in public feed
                if (!$isOwn && ($cat === 'complaint' || empty($fb['is_public']))) {
                    continue;
                }
                unset($fb['user_id']);
            }
            $list[] = $fb;
        }

        // Eligible sessions/orders for this customer to review
        $eligibleSessions = [];
        if ($user !== null && !$isAdmin) {
            $userSessions = $this->db->queryDocuments('sessions', [
                ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
            ], 'created_at', 'DESC');

            foreach ($userSessions as $s) {
                $eligibleSessions[] = [
                    'id' => $s['id'],
                    'room_id' => $s['room_id'],
                    'room_name' => $s['room_name'],
                    'status' => $s['status'],
                    'date' => substr((string)($s['created_at'] ?? ''), 0, 10),
                ];
            }
        }

        return [
            'average_rating' => $ratedCount > 0 ? round($totalRating / $ratedCount, 2) : 0.0,
            'total_reviews' => $ratedCount,
            'stars_breakdown' => $starsBreakdown,
            'category_counts' => $categoryCounts,
            'feedback_list' => $list,
            'eligible_sessions' => $eligibleSessions,
        ];
    }

    /**
     * Customer: Submit a rating (1-5), review, complaint, or suggestion.
     * Prevents duplicate session reviews unless an admin-approved correction (`allow_resubmit: true`) exists.
     */
    public function submitFeedback(array $user, array $input): array
    {
        $sessionId = trim((string)($input['session_id'] ?? ''));
        $rating = (int)($input['rating'] ?? 5);
        $category = strtolower(trim((string)($input['category'] ?? 'review')));
        $comment = trim((string)($input['comment'] ?? ''));

        if ($rating < 1 || $rating > 5) {
            throw new InvalidArgumentException('Rating must be between 1 and 5 stars.');
        }
        if (!in_array($category, ['review', 'complaint', 'suggestion'], true)) {
            throw new InvalidArgumentException('Category must be review, complaint, or suggestion.');
        }
        if (strlen($comment) < 5) {
            throw new InvalidArgumentException('Please write at least 5 characters in your feedback comment.');
        }

        return $this->db->runTransaction(function (FirestoreInterface $tx) use ($user, $sessionId, $rating, $category, $comment) {
            $roomId = null;
            $roomName = 'General Experience';

            if ($sessionId !== '') {
                $sess = $tx->getDocument('sessions', $sessionId);
                if ($sess) {
                    $roomId = $sess['room_id'] ?? null;
                    $roomName = $sess['room_name'] ?? 'Gaming Room';
                }

                // Check for duplicate review on the same session_id by this user
                $existingList = $tx->queryDocuments('feedback', [
                    ['field' => 'user_id', 'op' => '==', 'value' => $user['id']],
                    ['field' => 'session_id', 'op' => '==', 'value' => $sessionId],
                ]);

                foreach ($existingList as $existing) {
                    if (!empty($existing['allow_resubmit'])) {
                        // Admin-approved correction process: update existing review and reset allow_resubmit
                        return $tx->updateDocument('feedback', $existing['id'], [
                            'rating' => $rating,
                            'category' => $category,
                            'comment' => $comment,
                            'allow_resubmit' => false,
                            'corrected_at' => date('Y-m-d\TH:i:sP'),
                        ]);
                    }
                    throw new RuntimeException('You have already submitted feedback for this session (' . $sessionId . '). Duplicate session reviews are prevented unless an admin approves a correction.');
                }
            }

            // Privacy-safe public display name (e.g. "Alex Mercer" -> "Alex M.")
            $parts = preg_split('/\s+/', trim((string)$user['name']));
            $displayName = $parts[0] ?? 'Gamer';
            if (count($parts) > 1 && strlen($parts[1]) > 0) {
                $displayName .= ' ' . strtoupper($parts[1][0]) . '.';
            }

            $fb = $tx->createDocument('feedback', [
                'user_id' => $user['id'],
                'customer_display_name' => $displayName,
                'session_id' => $sessionId ?: null,
                'room_id' => $roomId,
                'room_name' => $roomName,
                'rating' => $rating,
                'category' => $category,
                'comment' => $comment,
                'admin_response' => null,
                'allow_resubmit' => false,
                'is_public' => $category !== 'complaint',
            ]);

            return $fb;
        });
    }

    /**
     * Admin: Respond to feedback or enable/disable `allow_resubmit` for correction.
     */
    public function respondToFeedback(string $feedbackId, array $input): array
    {
        $fb = $this->db->getDocument('feedback', $feedbackId);
        if (!$fb) {
            throw new InvalidArgumentException('Feedback entry not found.');
        }

        $updates = [];
        if (array_key_exists('admin_response', $input)) {
            $updates['admin_response'] = trim((string)$input['admin_response']);
        }
        if (array_key_exists('allow_resubmit', $input)) {
            $updates['allow_resubmit'] = (bool)$input['allow_resubmit'];
        }
        if (array_key_exists('is_public', $input)) {
            $updates['is_public'] = (bool)$input['is_public'];
        }

        return $this->db->updateDocument('feedback', $feedbackId, $updates) ?? $fb;
    }
}
