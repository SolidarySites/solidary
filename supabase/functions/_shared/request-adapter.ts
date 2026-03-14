/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Handler, HandlerEvent, HandlerResult } from "./types.ts";

const DEFAULT_CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-provision-internal-key";
const DEFAULT_CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

const titleCaseHeaderName = (value: string) =>
  value
    .split("-")
    .map((
      part,
    ) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join("-");

const buildEventHeaders = (request: Request): Record<string, string> => {
  const headers: Record<string, string> = {};

  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;

    const titled = titleCaseHeaderName(key);
    if (!(titled in headers)) {
      headers[titled] = value;
    }

    if (key.toLowerCase() === "authorization") {
      headers.Authorization = value;
    }
  }

  return headers;
};

const decodeBase64Body = (value: string): Uint8Array => {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
};

const decodeBase64BodyToBlob = (value: string) => {
  const bytes = decodeBase64Body(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer]);
};

const buildCorsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get("origin")?.trim() || "*";
  const requestedHeaders =
    request.headers.get("access-control-request-headers")?.trim() || "";

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": DEFAULT_CORS_ALLOW_METHODS,
    "access-control-allow-headers": requestedHeaders ||
      DEFAULT_CORS_ALLOW_HEADERS,
    "access-control-max-age": "86400",
    vary: "origin, access-control-request-headers",
  };
};

const statusDisallowsResponseBody = (statusCode: number) =>
  statusCode === 204 || statusCode === 205 || statusCode === 304;

const withCors = (response: Response, request: Request): Response => {
  const corsHeaders = buildCorsHeaders(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const toResponse = (result: HandlerResult): Response => {
  const statusCode = Number.isFinite(result?.statusCode)
    ? Number(result.statusCode)
    : 200;
  const responseHeaders = new Headers();

  if (result?.headers && typeof result.headers === "object") {
    for (const [key, rawValue] of Object.entries(result.headers)) {
      if (typeof rawValue === "string") {
        responseHeaders.set(key, rawValue);
      }
    }
  }

  const rawBody = typeof result?.body === "string" ? result.body : "";
  const body: BodyInit | null = statusDisallowsResponseBody(statusCode)
    ? null
    : result?.isBase64Encoded
    ? decodeBase64BodyToBlob(rawBody)
    : rawBody;

  return new Response(body, {
    status: statusCode,
    headers: responseHeaders,
  });
};

export const runHandler = async (
  request: Request,
  handler: Handler,
): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }), request);
  }

  const url = new URL(request.url);
  const bodyText = request.method === "GET" || request.method === "HEAD"
    ? ""
    : await request.text();

  const event: HandlerEvent = {
    httpMethod: request.method,
    headers: buildEventHeaders(request),
    body: bodyText.length ? bodyText : null,
    rawUrl: request.url,
    rawQuery: url.search.startsWith("?") ? url.search.slice(1) : "",
  };

  try {
    const result = await handler(event, {} as any);
    return withCors(
      toResponse(result ?? { statusCode: 204, body: "" }),
      request,
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Unhandled function error.";
    return withCors(
      new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: {
          "content-type": "application/json",
        },
      }),
      request,
    );
  }
};
