/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Handler, HandlerEvent, HandlerResult } from "./types.ts";

const titleCaseHeaderName = (value: string) =>
  value
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
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

const toResponse = (result: HandlerResult): Response => {
  const statusCode = Number.isFinite(result?.statusCode) ? Number(result.statusCode) : 200;
  const responseHeaders = new Headers();

  if (result?.headers && typeof result.headers === "object") {
    for (const [key, rawValue] of Object.entries(result.headers)) {
      if (typeof rawValue === "string") {
        responseHeaders.set(key, rawValue);
      }
    }
  }

  const rawBody = typeof result?.body === "string" ? result.body : "";
  const body: BodyInit | null = result?.isBase64Encoded ? decodeBase64Body(rawBody) : rawBody;

  return new Response(body, {
    status: statusCode,
    headers: responseHeaders
  });
};

export const runHandler = async (request: Request, handler: Handler): Promise<Response> => {
  const url = new URL(request.url);
  const bodyText = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();

  const event: HandlerEvent = {
    httpMethod: request.method,
    headers: buildEventHeaders(request),
    body: bodyText.length ? bodyText : null,
    rawUrl: request.url,
    rawQuery: url.search.startsWith("?") ? url.search.slice(1) : ""
  };

  try {
    const result = await handler(event, {} as any);
    return toResponse(result ?? { statusCode: 204, body: "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unhandled function error.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "content-type": "application/json"
      }
    });
  }
};
