<?php
declare(strict_types=1);

namespace Nexus\Config;

class Env
{
    private static bool $loaded = false;
    private static array $vars = [];

    public static function load(?string $path = null): void
    {
        if (self::$loaded) {
            return;
        }
        $envFile = $path ?? dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env';
        if (is_file($envFile) && is_readable($envFile)) {
            $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                    continue;
                }
                $parts = explode('=', $trimmed, 2);
                if (count($parts) === 2) {
                    $key = trim($parts[0]);
                    $val = trim($parts[1]);
                    if (
                        (str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                        (str_starts_with($val, "'") && str_ends_with($val, "'"))
                    ) {
                        $val = substr($val, 1, -1);
                    }
                    self::$vars[$key] = $val;
                    if (getenv($key) === false) {
                        putenv("{$key}={$val}");
                    }
                }
            }
        }
        self::$loaded = true;

        $tz = self::get('APP_TIMEZONE', 'Asia/Jakarta');
        if ($tz) {
            @date_default_timezone_set($tz);
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        self::load();
        if (array_key_exists($key, self::$vars)) {
            return self::$vars[$key];
        }
        $env = getenv($key);
        if ($env !== false) {
            return $env;
        }
        return $default;
    }

    public static function getBool(string $key, bool $default = false): bool
    {
        $val = self::get($key);
        if ($val === null || $val === '') {
            return $default;
        }
        if (is_bool($val)) {
            return $val;
        }
        return in_array(strtolower((string)$val), ['1', 'true', 'yes', 'on'], true);
    }

    public static function rootPath(string $subPath = ''): string
    {
        $base = dirname(__DIR__, 2);
        return $subPath === '' ? $base : $base . DIRECTORY_SEPARATOR . ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $subPath), DIRECTORY_SEPARATOR);
    }
}
