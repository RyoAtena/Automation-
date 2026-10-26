<?php
declare(strict_types=1);

use Nexus\Config\Env;
use Nexus\Database\FirestoreRepository;
use Nexus\Database\Seeder;

spl_autoload_register(static function (string $class): void {
    $prefix = 'Nexus\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $file = __DIR__ . DIRECTORY_SEPARATOR . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});

Env::load();

if (session_status() === PHP_SESSION_NONE && PHP_SAPI !== 'cli') {
    session_start();
}
