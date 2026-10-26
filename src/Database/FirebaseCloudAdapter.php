<?php
declare(strict_types=1);

namespace Nexus\Database;

use Nexus\Config\Env;
use RuntimeException;

class FirebaseCloudAdapter implements FirestoreInterface
{
    private string $projectId;
    private string $databaseId;
    private string $apiKey;
    private ?string $clientEmail = null;
    private ?string $privateKey = null;
    private ?string $cachedAccessToken = null;
    private int $tokenExpiresAt = 0;

    public function __construct()
    {
        $this->projectId = (string)Env::get('FIREBASE_PROJECT_ID', '');
        $this->databaseId = (string)Env::get('FIREBASE_DATABASE_ID', '(default)');
        $this->apiKey = (string)Env::get('FIREBASE_API_KEY', '');

        $saPath = (string)Env::get('FIREBASE_SERVICE_ACCOUNT_PATH', '');
        if ($saPath !== '') {
            $fullSaPath = str_contains($saPath, ':') || str_starts_with($saPath, '/')
                ? $saPath
                : Env::rootPath($saPath);
            if (is_file($fullSaPath) && is_readable($fullSaPath)) {
                $json = json_decode((string)file_get_contents($fullSaPath), true);
                if (is_array($json)) {
                    $this->projectId = $this->projectId ?: (string)($json['project_id'] ?? '');
                    $this->clientEmail = (string)($json['client_email'] ?? '');
                    $this->privateKey = (string)($json['private_key'] ?? '');
                }
            }
        }

        if (!$this->clientEmail) {
            $this->clientEmail = (string)Env::get('FIREBASE_CLIENT_EMAIL', '') ?: null;
        }
        if (!$this->privateKey) {
            $rawKey = (string)Env::get('FIREBASE_PRIVATE_KEY', '');
            if ($rawKey !== '') {
                $this->privateKey = str_replace('\n', "\n", $rawKey);
            }
        }
    }

    public static function isConfigured(): bool
    {
        $projectId = (string)Env::get('FIREBASE_PROJECT_ID', '');
        $saPath = (string)Env::get('FIREBASE_SERVICE_ACCOUNT_PATH', '');
        $apiKey = (string)Env::get('FIREBASE_API_KEY', '');
        $clientEmail = (string)Env::get('FIREBASE_CLIENT_EMAIL', '');

        if ($saPath !== '') {
            $fullPath = str_contains($saPath, ':') || str_starts_with($saPath, '/')
                ? $saPath
                : Env::rootPath($saPath);
            if (is_file($fullPath)) {
                return true;
            }
        }
        return $projectId !== '' && ($apiKey !== '' || $clientEmail !== '');
    }

    public function getDriverName(): string
    {
        return 'firebase';
    }

    public function getStatusInfo(): array
    {
        return [
            'driver' => 'firebase',
            'label' => 'Google Cloud Firestore REST v1',
            'cloud_connected' => $this->projectId !== '',
            'project_id' => $this->projectId,
            'database_id' => $this->databaseId,
            'service_account_active' => $this->clientEmail !== null && $this->privateKey !== null,
        ];
    }

    private function getBaseUrl(): string
    {
        if ($this->projectId === '') {
            throw new RuntimeException('FIREBASE_PROJECT_ID is not configured in .env');
        }
        return sprintf(
            'https://firestore.googleapis.com/v1/projects/%s/databases/%s/documents',
            rawurlencode($this->projectId),
            rawurlencode($this->databaseId)
        );
    }

    private function getAccessToken(): ?string
    {
        if (!$this->clientEmail || !$this->privateKey) {
            return null;
        }
        if ($this->cachedAccessToken !== null && time() < $this->tokenExpiresAt - 60) {
            return $this->cachedAccessToken;
        }

        $now = time();
        $header = $this->base64UrlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claimSet = $this->base64UrlEncode(json_encode([
            'iss' => $this->clientEmail,
            'scope' => 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ]));

        $unsigned = $header . '.' . $claimSet;
        $signature = '';
        if (!openssl_sign($unsigned, $signature, $this->privateKey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Failed to sign Firebase Service Account JWT with private key.');
        }
        $jwt = $unsigned . '.' . $this->base64UrlEncode($signature);

        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]),
            CURLOPT_TIMEOUT => 15,
        ]);
        $resp = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status !== 200 || !is_string($resp)) {
            throw new RuntimeException('Failed to exchange Firebase JWT for OAuth2 access token (HTTP ' . $status . ')');
        }
        $decoded = json_decode($resp, true);
        $this->cachedAccessToken = (string)($decoded['access_token'] ?? '');
        $this->tokenExpiresAt = $now + (int)($decoded['expires_in'] ?? 3600);
        return $this->cachedAccessToken;
    }

    private function request(string $method, string $url, ?array $body = null): array
    {
        if ($this->apiKey !== '' && !str_contains($url, 'key=')) {
            $sep = str_contains($url, '?') ? '&' : '?';
            $url .= $sep . 'key=' . rawurlencode($this->apiKey);
        }

        $headers = ['Accept: application/json'];
        $token = $this->getAccessToken();
        if ($token !== null) {
            $headers[] = 'Authorization: Bearer ' . $token;
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        if ($body !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new RuntimeException('Firestore REST API network error: ' . $err);
        }

        $decoded = json_decode((string)$response, true);
        return ['status' => $httpCode, 'body' => is_array($decoded) ? $decoded : []];
    }

    public function getDocument(string $collection, string $docId): ?array
    {
        $url = $this->getBaseUrl() . '/' . rawurlencode($collection) . '/' . rawurlencode($docId);
        $res = $this->request('GET', $url);
        if ($res['status'] === 404 || empty($res['body']['fields'])) {
            return null;
        }
        return $this->fromFirestoreDoc($res['body']);
    }

    public function setDocument(string $collection, string $docId, array $data, bool $merge = true): array
    {
        $now = date('Y-m-d\TH:i:sP');
        $existing = $merge ? $this->getDocument($collection, $docId) : null;
        if ($existing !== null && $merge) {
            $data = array_merge($existing, $data);
        }
        $data['id'] = $docId;
        $data['created_at'] = $data['created_at'] ?? ($existing['created_at'] ?? $now);
        $data['updated_at'] = $now;

        $url = $this->getBaseUrl() . '/' . rawurlencode($collection) . '/' . rawurlencode($docId);
        $payload = ['fields' => $this->toFirestoreFields($data)];
        $res = $this->request('PATCH', $url, $payload);
        if ($res['status'] >= 400) {
            throw new RuntimeException('Firestore setDocument failed: ' . json_encode($res['body']));
        }
        return $this->fromFirestoreDoc($res['body']);
    }

    public function createDocument(string $collection, array $data, ?string $customId = null): array
    {
        $docId = $customId ?: ($data['id'] ?? ('doc_' . bin2hex(random_bytes(8))));
        return $this->setDocument($collection, (string)$docId, $data, false);
    }

    public function updateDocument(string $collection, string $docId, array $fields): ?array
    {
        $existing = $this->getDocument($collection, $docId);
        if ($existing === null) {
            return null;
        }
        return $this->setDocument($collection, $docId, $fields, true);
    }

    public function deleteDocument(string $collection, string $docId): bool
    {
        $url = $this->getBaseUrl() . '/' . rawurlencode($collection) . '/' . rawurlencode($docId);
        $res = $this->request('DELETE', $url);
        return $res['status'] >= 200 && $res['status'] < 300;
    }

    public function queryDocuments(
        string $collection,
        array $filters = [],
        ?string $orderBy = null,
        string $direction = 'ASC',
        ?int $limit = null
    ): array {
        $url = $this->getBaseUrl() . '/' . rawurlencode($collection) . '?pageSize=500';
        $res = $this->request('GET', $url);
        $docs = $res['body']['documents'] ?? [];
        $results = [];

        foreach ($docs as $rawDoc) {
            $doc = $this->fromFirestoreDoc($rawDoc);
            if ($this->matchesFilters($doc, $filters)) {
                $results[] = $doc;
            }
        }

        if ($orderBy !== null) {
            $dirMultiplier = strtoupper($direction) === 'DESC' ? -1 : 1;
            usort($results, static function (array $a, array $b) use ($orderBy, $dirMultiplier): int {
                $valA = $a[$orderBy] ?? null;
                $valB = $b[$orderBy] ?? null;
                if ($valA === $valB) {
                    return 0;
                }
                if (is_numeric($valA) && is_numeric($valB)) {
                    return ((float)$valA <=> (float)$valB) * $dirMultiplier;
                }
                return strcmp((string)$valA, (string)$valB) * $dirMultiplier;
            });
        }

        if ($limit !== null && $limit > 0) {
            $results = array_slice($results, 0, $limit);
        }

        return $results;
    }

    private function matchesFilters(array $doc, array $filters): bool
    {
        foreach ($filters as $filter) {
            $field = $filter['field'] ?? '';
            $op = $filter['op'] ?? '==';
            $target = $filter['value'] ?? null;
            $actual = $doc[$field] ?? null;

            $matched = match ($op) {
                '==', '=' => $actual == $target,
                '!=', '<>' => $actual != $target,
                '>' => $actual > $target,
                '>=' => $actual >= $target,
                '<' => $actual < $target,
                '<=' => $actual <= $target,
                'in' => is_array($target) && in_array($actual, $target, false),
                'contains' => is_array($actual)
                    ? in_array($target, $actual, false)
                    : (is_string($actual) && str_contains(strtolower($actual), strtolower((string)$target))),
                default => false,
            };

            if (!$matched) {
                return false;
            }
        }
        return true;
    }

    public function listCollections(): array
    {
        return [
            'users', 'rooms', 'games', 'room_games', 'bookings', 'queues',
            'sessions', 'controllers', 'controller_requests', 'menu_items',
            'orders', 'inventory_movements', 'transactions', 'expenses',
            'support_conversations', 'support_messages', 'feedback',
            'notifications', 'settings'
        ];
    }

    public function runTransaction(callable $callback): mixed
    {
        return $callback($this);
    }

    private function toFirestoreFields(array $assoc): array
    {
        $fields = [];
        foreach ($assoc as $k => $v) {
            $fields[(string)$k] = $this->encodeValue($v);
        }
        return $fields;
    }

    private function encodeValue(mixed $val): array
    {
        if ($val === null) {
            return ['nullValue' => null];
        }
        if (is_bool($val)) {
            return ['booleanValue' => $val];
        }
        if (is_int($val)) {
            return ['integerValue' => (string)$val];
        }
        if (is_float($val)) {
            return ['doubleValue' => $val];
        }
        if (is_array($val)) {
            if (array_is_list($val)) {
                return ['arrayValue' => ['values' => array_map([$this, 'encodeValue'], $val)]];
            }
            return ['mapValue' => ['fields' => $this->toFirestoreFields($val)]];
        }
        return ['stringValue' => (string)$val];
    }

    private function fromFirestoreDoc(array $doc): array
    {
        $result = [];
        $fields = $doc['fields'] ?? [];
        foreach ($fields as $k => $typedVal) {
            $result[$k] = $this->decodeValue($typedVal);
        }
        if (isset($doc['name'])) {
            $parts = explode('/', (string)$doc['name']);
            $result['id'] = end($parts);
        }
        return $result;
    }

    private function decodeValue(array $typedVal): mixed
    {
        if (array_key_exists('nullValue', $typedVal)) {
            return null;
        }
        if (array_key_exists('booleanValue', $typedVal)) {
            return (bool)$typedVal['booleanValue'];
        }
        if (array_key_exists('integerValue', $typedVal)) {
            return (int)$typedVal['integerValue'];
        }
        if (array_key_exists('doubleValue', $typedVal)) {
            return (float)$typedVal['doubleValue'];
        }
        if (array_key_exists('stringValue', $typedVal)) {
            return (string)$typedVal['stringValue'];
        }
        if (array_key_exists('timestampValue', $typedVal)) {
            return (string)$typedVal['timestampValue'];
        }
        if (array_key_exists('arrayValue', $typedVal)) {
            $values = $typedVal['arrayValue']['values'] ?? [];
            return array_map([$this, 'decodeValue'], $values);
        }
        if (array_key_exists('mapValue', $typedVal)) {
            $fields = $typedVal['mapValue']['fields'] ?? [];
            $out = [];
            foreach ($fields as $k => $v) {
                $out[$k] = $this->decodeValue($v);
            }
            return $out;
        }
        return null;
    }

    private function base64UrlEncode(string $input): string
    {
        return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
    }
}
