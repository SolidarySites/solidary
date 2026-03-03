/* eslint-disable @typescript-eslint/no-explicit-any */
export type HandlerEvent = {
  httpMethod: string;
  headers: Record<string, string>;
  body: string | null;
  rawUrl: string;
  rawQuery: string;
  [key: string]: unknown;
};

export type HandlerResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
};

export type Handler = (
  event: HandlerEvent,
  context: any
) => Promise<HandlerResult> | HandlerResult;
