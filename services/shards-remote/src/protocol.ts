export class GatewayError extends Error {
  kind: string;
  execution: 'not_started' | 'unknown' | 'completed';
  status: number;
  constructor(kind: string, execution: 'not_started' | 'unknown' | 'completed', status: number) { super(kind); this.kind = kind; this.execution = execution; this.status = status; }
}
export const MAX_BYTES = 16 * 1024 * 1024;
export function parseLossless(text: string): any {
  return JSON.parse(text, (_key: string, value: any, context?: { source?: string }) =>
    typeof value === 'number' && !Number.isSafeInteger(value) && context?.source && /^-?\d+$/.test(context.source)
      ? JSON.rawJSON(context.source) : value);
}
export function controlResult(error: GatewayError) {
  const detail = { kind: error.kind, message: 'Private gateway request failed', execution: error.execution };
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(detail) }], structuredContent: detail };
}
