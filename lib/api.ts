const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function withCors(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);

  Object.entries(BASE_CORS_HEADERS).forEach(([key, value]) => {
    merged.set(key, value);
  });

  return merged;
}

export function jsonWithCors(
  data: unknown,
  init?: ResponseInit,
): Response {
  const headers = withCors(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function audioWithCors(
  body: Buffer | Uint8Array,
  init?: ResponseInit,
): Response {
  const headers = withCors(init?.headers);
  headers.set("Content-Type", "audio/mpeg");
  headers.set("Cache-Control", "no-store");
  const binaryBody = Uint8Array.from(body);

  return new Response(binaryBody as BodyInit, {
    ...init,
    headers,
  });
}

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: withCors({
      "Access-Control-Max-Age": "86400",
    }),
  });
}
