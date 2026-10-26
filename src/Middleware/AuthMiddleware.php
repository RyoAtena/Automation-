<?php
declare(strict_types=1);

namespace Nexus\Middleware;

use Nexus\Database\FirestoreInterface;
use Nexus\Services\AuthService;
use RuntimeException;

class AuthMiddleware
{
    private AuthService $authService;

    public function __construct(private FirestoreInterface $db)
    {
        $this->authService = new AuthService($db);
    }

    public function getCurrentUser(): ?array
    {
        // 1. Check Bearer / X-Auth-Token header first
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
        if ($authHeader !== '') {
            $token = str_starts_with($authHeader, 'Bearer ')
                ? trim(substr($authHeader, 7))
                : trim($authHeader);
            if ($token !== '') {
                $verified = $this->authService->verifyToken($token);
                if ($verified !== null) {
                    return $verified;
                }
            }
        }

        // 2. Check active PHP session
        if (session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION['nexus_user']['id'])) {
            $uid = (string)$_SESSION['nexus_user']['id'];
            $fresh = $this->db->getDocument('users', $uid);
            if ($fresh && ($fresh['status'] ?? 'active') === 'active') {
                return $this->authService->sanitizeUser($fresh);
            }
        }

        return null;
    }

    public function requireAuth(): array
    {
        $user = $this->getCurrentUser();
        if ($user === null) {
            http_response_code(401);
            throw new RuntimeException('Authentication required. Please log in.');
        }
        return $user;
    }

    public function requireAdmin(): array
    {
        $user = $this->requireAuth();
        if (($user['role'] ?? '') !== 'admin') {
            http_response_code(403);
            throw new RuntimeException('Forbidden: Administrator privileges are required for this action.');
        }
        return $user;
    }
}
