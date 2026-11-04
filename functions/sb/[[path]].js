// Cloudflare Pages Function: пересылает запросы /sb/* в проект Supabase.
//
// Зачем: часть мобильных операторов РФ не пропускает *.supabase.co, а домен сайта
// открывается нормально. Браузер -> домен сайта -> Cloudflare -> Supabase.
//
// Сайт также открывается с GitHub Pages, а там серверной части нет, поэтому оттуда
// браузер обращается к этому прокси с другого домена. Для таких адресов (ALLOWED_ORIGINS)
// функция сама отвечает на CORS-запросы. Запросы с самого Cloudflare-домена идут как раньше.
//
// Если сайт начнёт использовать Storage или Edge Functions, добавьте
// "/storage/v1/" или "/functions/v1/" в ALLOWED_PREFIXES.
const SUPABASE_URL = "https://ibanvzomiosaboheuypl.supabase.co";
const ALLOWED_PREFIXES = ["/rest/v1/", "/auth/v1/"];
const ALLOWED_ORIGINS = [
  /^https:\/\/2leviathan2\.github\.io$/i,
  /^https:\/\/([a-z0-9-]+\.)?mib-vl\.pages\.dev$/i,
];

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.some((re) => re.test(origin))) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "access-control-allow-headers":
      request.headers.get("access-control-request-headers") ||
      "authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export async function onRequest({ request }) {
  const cors = corsHeaders(request);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/sb/, "");

  // Предварительный CORS-запрос браузера отправляем не в Supabase, а отвечаем сами
  if (request.method === "OPTIONS" && cors) {
    return new Response(null, { status: 204, headers: cors });
  }

  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return new Response("Not found", { status: 404, headers: cors || {} });
  }

  const headers = new Headers(request.headers);
  headers.delete("host");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    const upstream = await fetch(SUPABASE_URL + path + url.search, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
    });
    if (!cors) return upstream;

    // Копия ответа с разрешением для адреса сайта (остальные заголовки Supabase сохраняются)
    const res = new Response(upstream.body, upstream);
    res.headers.set("access-control-allow-origin", cors["access-control-allow-origin"]);
    res.headers.append("vary", "Origin");
    return res;
  } catch (err) {
    return new Response(JSON.stringify({ message: "Supabase unreachable from proxy" }), {
      status: 502,
      headers: { "content-type": "application/json", ...(cors || {}) },
    });
  }
}
