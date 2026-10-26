<?php
declare(strict_types=1);

$uri = urldecode((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
$publicDir = __DIR__ . DIRECTORY_SEPARATOR . 'public';
$requestedFile = $publicDir . str_replace('/', DIRECTORY_SEPARATOR, $uri);

if ($uri !== '/' && is_file($requestedFile)) {
    $ext = strtolower(pathinfo($requestedFile, PATHINFO_EXTENSION));
    $mimeTypes = [
        'css' => 'text/css; charset=utf-8',
        'js' => 'application/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'ico' => 'image/x-icon',
    ];
    if (isset($mimeTypes[$ext])) {
        header('Content-Type: ' . $mimeTypes[$ext]);
        readfile($requestedFile);
        return true;
    }
    if ($ext === 'php') {
        require $requestedFile;
        return true;
    }
    return false;
}

if ($uri === '/api.php' || str_starts_with($uri, '/api/')) {
    require $publicDir . DIRECTORY_SEPARATOR . 'api.php';
    return true;
}

require $publicDir . DIRECTORY_SEPARATOR . 'index.php';
return true;
