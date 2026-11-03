// Cloudflare Pages Function: пересылает запросы /sb/* в проект Supabase.
//
// Зачем: часть мобильных операторов РФ не пропускает *.supabase.co, а домен сайта
// открывается нормально. Браузер -> домен сайта -> Cloudflare -> Supabase.
//
// Если сайт начнёт использовать Storage или Edge Functions, добавьте
// "/storage/v1/" или "/functions/v1/" в ALLOWED_PREFIXES.
const SUPABASE_URL = "https://ibanvzomiosaboheuypl.supabase.co";
const ALLOWED_PREFIXES = ["/rest/v1/", "/auth/v1/"];

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/sb/, "");

  if (!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers(request.headers);
  headers.delete("host");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  try {
    return await fetch(SUPABASE_URL + path + url.search, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
    });
  } catch (err) {
    return new Response(JSON.stringify({ message: "Supabase unreachable from proxy" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
