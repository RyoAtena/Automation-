<?php
declare(strict_types=1);

namespace Nexus\Database;

use Nexus\Config\Env;

class FirestoreRepository
{
    private static ?FirestoreInterface $instance = null;

    public static function getInstance(?string $overrideLocalPath = null): FirestoreInterface
    {
        if ($overrideLocalPath !== null) {
            self::$instance = new LocalFirestoreAdapter($overrideLocalPath);
            return self::$instance;
        }

        if (self::$instance !== null) {
            return self::$instance;
        }

        Env::load();
        $driver = strtolower((string)Env::get('DB_DRIVER', 'auto'));

        if ($driver === 'firebase') {
            self::$instance = new FirebaseCloudAdapter();
        } elseif ($driver === 'auto' && FirebaseCloudAdapter::isConfigured()) {
            self::$instance = new FirebaseCloudAdapter();
        } else {
            self::$instance = new LocalFirestoreAdapter();
        }

        return self::$instance;
    }

    public static function setInstance(FirestoreInterface $adapter): void
    {
        self::$instance = $adapter;
    }
}
