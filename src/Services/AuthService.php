<?php
declare(strict_types=1);

namespace Nexus\Services;

use InvalidArgumentException;
use Nexus\Config\Env;
use Nexus\Database\FirestoreInterface;
use RuntimeException;

class AuthService
{
    public function __construct(private FirestoreInterface $db)
    {
    }

    public function register(array $input): array
    {
        $name = trim((string)($input['name'] ?? ''));
        $email = strtolower(trim((string)($input['email'] ?? '')));
        $phone = trim((string)($input['phone'] ?? ''));
        $password = (string)($input['password'] ?? '');

        if ($name === '' || strlen($name) < 2) {
            throw new InvalidArgumentException('Full name must be at least 2 characters.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Please provide a valid email address.');
        }
        if (strlen($password) < 6) {
            throw new InvalidArgumentException('Password must be at least 6 characters long.');
        }

        $existing = $this->db->queryDocuments('users', [
            ['field' => 'email', 'op' => '==', 'value' => $email],
        ], null, 'ASC', 1);

        if (!empty($existing)) {
            throw new InvalidArgumentException('An account with this email address already exists.');
        }

        $firebaseUid = null;
        $firebaseApiKey = (string)Env::get('FIREBASE_API_KEY', '');
        if ($firebaseApiKey !== '') {
            $firebaseUid = $this->registerWithFirebaseAuthRest($firebaseApiKey, $email, $password);
        }

        $userId = $firebaseUid ?: ('usr_' . bin2hex(random_bytes(6)));
        $userDoc = $this->db->setDocument('users', $userId, [
            'id' => $userId,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'role' => 'customer',
            'status' => 'active',
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'is_demo' => false,
        ], false);

        $safeUser = $this->sanitizeUser($userDoc);
        $token = $this->issueToken($safeUser);
        $this->persistSession($safeUser);

        return [
            'user' => $safeUser,
            'token' => $token,
        ];
    }

    public function login(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        if ($email === '' || $password === '') {
            throw new InvalidArgumentException('Email and password are required.');
        }

        $users = $this->db->queryDocuments('users', [
            ['field' => 'email', 'op' => '==', 'value' => $email],
        ], null, 'ASC', 1);

        if (empty($users)) {
            throw new RuntimeException('Invalid email or password.');
        }

        $user = $users[0];
        if (($user['status'] ?? 'active') !== 'active') {
            throw new RuntimeException('This account has been deactivated. Please contact an administrator.');
        }

        $hash = (string)($user['password_hash'] ?? '');
        if ($hash === '' || !password_verify($password, $hash)) {
            throw new RuntimeException('Invalid email or password.');
        }

        $safeUser = $this->sanitizeUser($user);
        $token = $this->issueToken($safeUser);
        $this->persistSession($safeUser);

        return [
            'user' => $safeUser,
            'token' => $token,
        ];
    }

    public function logout(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION = [];
            session_destroy();
        }
    }

    public function updateProfile(string $userId, array $input): array
    {
        $user = $this->db->getDocument('users', $userId);
        if (!$user) {
            throw new RuntimeException('User not found.');
        }

        $updates = [];
        if (isset($input['name'])) {
            $name = trim((string)$input['name']);
            if (strlen($name) < 2) {
                throw new InvalidArgumentException('Name must be at least 2 characters.');
            }
            $updates['name'] = $name;
        }
        if (isset($input['phone'])) {
            $updates['phone'] = trim((string)$input['phone']);
        }
        if (!empty($input['new_password'])) {
            $newPass = (string)$input['new_password'];
            if (strlen($newPass) < 6) {
                throw new InvalidArgumentException('New password must be at least 6 characters.');
            }
            $updates['password_hash'] = password_hash($newPass, PASSWORD_BCRYPT);
        }

        $updated = $this->db->updateDocument('users', $userId, $updates);
        $safe = $this->sanitizeUser($updated ?? $user);
        $this->persistSession($safe);
        return $safe;
    }

    public function listAllUsers(): array
    {
        $users = $this->db->queryDocuments('users', [], 'created_at', 'DESC');
        return array_map([$this, 'sanitizeUser'], $users);
    }

    public function adminUpdateUser(string $targetUserId, array $input): array
    {
        $user = $this->db->getDocument('users', $targetUserId);
        if (!$user) {
            throw new InvalidArgumentException('Target user does not exist.');
        }

        $updates = [];
        if (isset($input['role']) && in_array($input['role'], ['customer', 'admin'], true)) {
            $updates['role'] = $input['role'];
        }
        if (isset($input['status']) && in_array($input['status'], ['active', 'suspended'], true)) {
            $updates['status'] = $input['status'];
        }
        if (isset($input['name']) && trim((string)$input['name']) !== '') {
            $updates['name'] = trim((string)$input['name']);
        }
        if (isset($input['phone'])) {
            $updates['phone'] = trim((string)$input['phone']);
        }

        $updated = $this->db->updateDocument('users', $targetUserId, $updates);
        return $this->sanitizeUser($updated ?? $user);
    }

    public function sanitizeUser(array $user): array
    {
        unset($user['password_hash']);
        return $user;
    }

    public function issueToken(array $safeUser): string
    {
        $secret = (string)Env::get('APP_SECRET', 'nexus_default_secret_key_2026');
        $payload = base64_encode((string)json_encode([
            'uid' => $safeUser['id'],
            'role' => $safeUser['role'] ?? 'customer',
            'email' => $safeUser['email'] ?? '',
            'exp' => time() + 86400,
        ]));
        $sig = hash_hmac('sha256', $payload, $secret);
        return $payload . '.' . $sig;
    }

    public function verifyToken(string $token): ?array
    {
        $parts = explode('.', $token, 2);
        if (count($parts) !== 2) {
            return null;
        }
        [$payloadB64, $sig] = $parts;
        $secret = (string)Env::get('APP_SECRET', 'nexus_default_secret_key_2026');
        $expected = hash_hmac('sha256', $payloadB64, $secret);
        if (!hash_equals($expected, $sig)) {
            return null;
        }
        $decoded = json_decode((string)base64_decode($payloadB64, true), true);
        if (!is_array($decoded) || empty($decoded['uid']) || ($decoded['exp'] ?? 0) < time()) {
            return null;
        }
        $user = $this->db->getDocument('users', (string)$decoded['uid']);
        if (!$user || ($user['status'] ?? 'active') !== 'active') {
            return null;
        }
        return $this->sanitizeUser($user);
    }

    private function persistSession(array $safeUser): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            $_SESSION['nexus_user'] = $safeUser;
        }
    }

    private function registerWithFirebaseAuthRest(string $apiKey, string $email, string $password): ?string
    {
        try {
            $url = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' . rawurlencode($apiKey);
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode([
                    'email' => $email,
                    'password' => $password,
                    'returnSecureToken' => true,
                ]),
                CURLOPT_TIMEOUT => 8,
            ]);
            $resp = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code === 200 && is_string($resp)) {
                $data = json_decode($resp, true);
                return $data['localId'] ?? null;
            }
        } catch (\Throwable) {
            // Fallback to local Firestore ID if Firebase Auth REST is unreachable
        }
        return null;
    }
}
