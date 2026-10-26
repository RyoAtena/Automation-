<?php
declare(strict_types=1);

namespace Nexus\Database;

interface FirestoreInterface
{
    public function getDriverName(): string;

    public function getStatusInfo(): array;

    public function getDocument(string $collection, string $docId): ?array;

    public function setDocument(string $collection, string $docId, array $data, bool $merge = true): array;

    public function createDocument(string $collection, array $data, ?string $customId = null): array;

    public function updateDocument(string $collection, string $docId, array $fields): ?array;

    public function deleteDocument(string $collection, string $docId): bool;

    /**
     * @param string $collection
     * @param array $filters Array of ['field' => string, 'op' => '=='|'!='|'<'|'<='|'>'|'>='|'in'|'contains', 'value' => mixed]
     * @param string|null $orderBy Field name
     * @param string $direction 'ASC' or 'DESC'
     * @param int|null $limit
     * @return array<int, array>
     */
    public function queryDocuments(
        string $collection,
        array $filters = [],
        ?string $orderBy = null,
        string $direction = 'ASC',
        ?int $limit = null
    ): array;

    public function listCollections(): array;

    /**
     * Executes an atomic read-write operation.
     * @param callable(FirestoreInterface): mixed $callback
     * @return mixed
     */
    public function runTransaction(callable $callback): mixed;
}
