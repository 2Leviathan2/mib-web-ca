<?php
// Прокси /sb/* -> Supabase для хостинга в РФ (то же, что functions/sb/[[path]].js на Cloudflare).
// Браузер ходит только на адрес сайта, в Supabase обращается сервер хостинга.
// shortcut: ответ целиком копится в памяти, для прайс-листа и заявок этого хватает.
$upstream = getenv('SB_UPSTREAM') ?: 'https://ibanvzomiosaboheuypl.supabase.co'; // переменная нужна только тестам

function fail($code, $msg) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['message' => $msg]);
    exit;
}

$path = preg_replace('#^/sb#', '', (string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$allowed = strpos($path, '/rest/v1/') === 0 || strpos($path, '/auth/v1/') === 0;
if (!$allowed || strpos($path, '..') !== false || stripos($path, '%2e') !== false) fail(404, 'Not found');

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'], true)) fail(405, 'Method not allowed');

// Пересылаем только нужные заголовки: без Host, Cookie и прочего лишнего
$pass = ['apikey', 'authorization', 'content-type', 'prefer', 'accept', 'accept-profile', 'content-profile', 'range', 'x-client-info', 'x-supabase-api-version'];
$in = [];
foreach ($_SERVER as $k => $v) {
    if (strpos($k, 'HTTP_') === 0) $in[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
}
if (isset($_SERVER['CONTENT_TYPE'])) $in['content-type'] = $_SERVER['CONTENT_TYPE'];
// Apache с PHP-CGI/FPM прячет Authorization — без него вход админа превратится в анонимный запрос
if (!isset($in['authorization'])) {
    $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? (function_exists('getallheaders') ? (getallheaders()['Authorization'] ?? null) : null);
    if ($auth) $in['authorization'] = $auth;
}
$headers = [];
foreach ($pass as $n) if (isset($in[$n])) $headers[] = "$n: {$in[$n]}";

$query = $_SERVER['QUERY_STRING'] ?? '';
$ch = curl_init($upstream . $path . ($query !== '' ? '?' . $query : ''));
$res = [];
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => '', // curl сам распаковывает gzip, поэтому content-encoding назад не отдаём
    CURLOPT_TIMEOUT => 25,
    CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$res) {
        $p = explode(':', $line, 2);
        if (count($p) === 2) $res[strtolower(trim($p[0]))] = trim($p[1]);
        return strlen($line);
    },
]);
if ($method === 'HEAD') curl_setopt($ch, CURLOPT_NOBODY, true);
elseif ($method !== 'GET') curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));

$body = curl_exec($ch);
if ($body === false) fail(502, 'Supabase unreachable from proxy');

http_response_code(curl_getinfo($ch, CURLINFO_RESPONSE_CODE));
// У пустых ответов (201 на заявку) нет content-type. PHP дописал бы text/html, а сайт принял бы его за ошибку и повторил заявку
ini_set('default_mimetype', '');
header('Cache-Control: no-store');
foreach (['content-type', 'content-range', 'content-profile', 'preference-applied', 'retry-after', 'www-authenticate', 'x-supabase-api-version'] as $n) {
    if (isset($res[$n])) header("$n: {$res[$n]}");
}
echo $body;
