<?php
declare(strict_types=1);

namespace Nexus\Database;

use Nexus\Config\Env;
use PDO;
use RuntimeException;
use Throwable;

class LocalFirestoreAdapter implements FirestoreInterface
{
    private PDO $pdo;
    private string $dbPath;
    private int $txDepth = 0;

    public function __construct(?string $customPath = null)
    {
        $relPath = $customPath ?? (string)Env::get('LOCAL_FIRESTORE_PATH', 'storage/firestore_local.sqlite');
        $candidatePath = str_contains($relPath, ':') || str_starts_with($relPath, '/')
            ? $relPath
            : Env::rootPath($relPath);

        $dir = dirname($candidatePath);
        if (getenv('VERCEL') || getenv('AWS_LAMBDA_FUNCTION_NAME')) {
            $this->dbPath = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'nexus_firestore_local.sqlite';
        } else {
            if (!is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
            if (!is_dir($dir) || !is_writable($dir)) {
                $this->dbPath = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'nexus_firestore_local.sqlite';
            } else {
                $this->dbPath = $candidatePath;
            }
        }

        $this->pdo = new PDO('sqlite:' . $this->dbPath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 10,
        ]);

        $this->pdo->exec('PRAGMA journal_mode = WAL;');
        $this->pdo->exec('PRAGMA synchronous = NORMAL;');
        $this->pdo->exec('PRAGMA foreign_keys = ON;');
        $this->pdo->exec('PRAGMA busy_timeout = 5000;');

        $this->initializeTables();
    }

    private function initializeTables(): void
    {
        $this->pdo->exec(<<<SQL
            CREATE TABLE IF NOT EXISTS firestore_documents (
                collection VARCHAR(128) NOT NULL,
                doc_id VARCHAR(128) NOT NULL,
                data JSON NOT NULL,
                created_at VARCHAR(40) NOT NULL,
                updated_at VARCHAR(40) NOT NULL,
                PRIMARY KEY (collection, doc_id)
            );
            CREATE INDEX IF NOT EXISTS idx_firestore_collection ON firestore_documents(collection);
            CREATE INDEX IF NOT EXISTS idx_firestore_updated ON firestore_documents(collection, updated_at);
        SQL);
    }

    public function getDriverName(): string
    {
        return 'local_firestore';
    }

    public function getStatusInfo(): array
    {
        return [
            'driver' => 'local_firestore',
            'label' => 'Local Firestore Engine (SQLite WAL ACID)',
            'cloud_connected' => false,
            'storage_path' => basename($this->dbPath),
            'collections' => $this->listCollections(),
        ];
    }

    public function getDocument(string $collection, string $docId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT data, created_at, updated_at FROM firestore_documents WHERE collection = :c AND doc_id = :id LIMIT 1');
        $stmt->execute([':c' => $collection, ':id' => $docId]);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        $decoded = json_decode((string)$row['data'], true);
        if (!is_array($decoded)) {
            $decoded = [];
        }
        $decoded['id'] = $docId;
        if (!isset($decoded['created_at'])) {
            $decoded['created_at'] = $row['created_at'];
        }
        if (!isset($decoded['updated_at'])) {
            $decoded['updated_at'] = $row['updated_at'];
        }
        return $decoded;
    }

    public function setDocument(string $collection, string $docId, array $data, bool $merge = true): array
    {
        $now = date('Y-m-d\TH:i:sP');
        $existing = $this->getDocument($collection, $docId);

        if ($existing !== null && $merge) {
            $createdAt = $existing['created_at'] ?? $now;
            $merged = array_merge($existing, $data);
        } else {
            $createdAt = $data['created_at'] ?? ($existing['created_at'] ?? $now);
            $merged = $data;
        }

        $merged['id'] = $docId;
        $merged['created_at'] = $createdAt;
        $merged['updated_at'] = $data['updated_at'] ?? $now;

        $json = json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $stmt = $this->pdo->prepare(<<<SQL
            INSERT INTO firestore_documents (collection, doc_id, data, created_at, updated_at)
            VALUES (:c, :id, :data, :created, :updated)
            ON CONFLICT(collection, doc_id) DO UPDATE SET
                data = excluded.data,
                updated_at = excluded.updated_at
        SQL);

        $stmt->execute([
            ':c' => $collection,
            ':id' => $docId,
            ':data' => $json,
            ':created' => $merged['created_at'],
            ':updated' => $merged['updated_at'],
        ]);

        $this->maybeMirrorToJson();
        return $merged;
    }

    public function createDocument(string $collection, array $data, ?string $customId = null): array
    {
        $docId = $customId ?: ($data['id'] ?? $this->generateFirestoreId($collection));
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
        $stmt = $this->pdo->prepare('DELETE FROM firestore_documents WHERE collection = :c AND doc_id = :id');
        $stmt->execute([':c' => $collection, ':id' => $docId]);
        $deleted = $stmt->rowCount() > 0;
        if ($deleted) {
            $this->maybeMirrorToJson();
        }
        return $deleted;
    }

    public function queryDocuments(
        string $collection,
        array $filters = [],
        ?string $orderBy = null,
        string $direction = 'ASC',
        ?int $limit = null
    ): array {
        $stmt = $this->pdo->prepare('SELECT doc_id, data, created_at, updated_at FROM firestore_documents WHERE collection = :c');
        $stmt->execute([':c' => $collection]);
        $rows = $stmt->fetchAll();

        $results = [];
        foreach ($rows as $row) {
            $doc = json_decode((string)$row['data'], true);
            if (!is_array($doc)) {
                continue;
            }
            $doc['id'] = $row['doc_id'];
            if (!isset($doc['created_at'])) {
                $doc['created_at'] = $row['created_at'];
            }
            if (!isset($doc['updated_at'])) {
                $doc['updated_at'] = $row['updated_at'];
            }

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
                '===' => $actual === $target,
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
        $stmt = $this->pdo->query('SELECT DISTINCT collection FROM firestore_documents ORDER BY collection ASC');
        return array_column($stmt->fetchAll(), 'collection');
    }

    public function runTransaction(callable $callback): mixed
    {
        if ($this->txDepth === 0) {
            $this->pdo->exec('BEGIN IMMEDIATE TRANSACTION');
        }
        $this->txDepth++;

        try {
            $result = $callback($this);
            $this->txDepth--;
            if ($this->txDepth === 0) {
                $this->pdo->exec('COMMIT');
                $this->maybeMirrorToJson();
            }
            return $result;
        } catch (Throwable $e) {
            $this->txDepth--;
            if ($this->txDepth === 0) {
                try {
                    $this->pdo->exec('ROLLBACK');
                } catch (Throwable) {
                }
            }
            throw $e;
        }
    }

    private function generateFirestoreId(string $prefix = ''): string
    {
        $chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        $id = '';
        for ($i = 0; $i < 20; $i++) {
            $id .= $chars[random_int(0, 61)];
        }
        return $prefix !== '' ? substr($prefix, 0, 4) . '_' . substr($id, 0, 15) : $id;
    }

    private function maybeMirrorToJson(): void
    {
        if ($this->txDepth > 0 || !Env::getBool('LOCAL_FIRESTORE_MIRROR_JSON', true)) {
            return;
        }
        try {
            $stmt = $this->pdo->query('SELECT collection, doc_id, data FROM firestore_documents ORDER BY collection, doc_id');
            $mirror = [];
            foreach ($stmt->fetchAll() as $row) {
                $mirror[$row['collection']][$row['doc_id']] = json_decode((string)$row['data'], true);
            }
            $mirrorPath = dirname($this->dbPath) . DIRECTORY_SEPARATOR . 'firestore_mirror.json';
            @file_put_contents($mirrorPath, json_encode($mirror, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } catch (Throwable) {
            // Non-critical mirror export
        }
    }
}
