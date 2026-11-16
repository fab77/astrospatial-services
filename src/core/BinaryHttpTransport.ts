import { ServiceError } from './ServiceError.js';

export interface BinaryRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  expectedByteLength?: number;
}

export interface BinaryHttpResponse {
  status: number;
  headers: Headers;
  body: ArrayBuffer | ArrayBufferView;
}

export interface BinaryHttpTransport {
  getArrayBuffer(url: string, options?: BinaryRequestOptions): Promise<BinaryHttpResponse>;
}

export class FetchBinaryHttpTransport implements BinaryHttpTransport {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getArrayBuffer(
    url: string,
    options: BinaryRequestOptions = {},
  ): Promise<BinaryHttpResponse> {
    const timeoutMs = options.timeoutMs ?? 120000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
    if (
      options.expectedByteLength !== undefined &&
      (!Number.isInteger(options.expectedByteLength) || options.expectedByteLength < 0)
    ) {
      throw new RangeError('expectedByteLength must be a non-negative integer');
    }
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new TypeError('Binary URL must use HTTP or HTTPS');
    }
    if (parsedUrl.username || parsedUrl.password) {
      throw new TypeError('Binary URL must not contain credentials');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const onAbort = () => controller.abort('caller');
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) controller.abort('caller');
    try {
      const response = await this.fetchImpl(parsedUrl, { method: 'GET', signal: controller.signal });
      if (!response.ok) {
        throw new ServiceError('HTTP', `HTTP ${response.status} for ${parsedUrl}`, response.status);
      }
      const contentLengthText = response.headers.get('content-length');
      const contentLength = contentLengthText === null ? undefined : Number(contentLengthText);
      if (
        options.expectedByteLength !== undefined &&
        contentLength !== undefined &&
        Number.isFinite(contentLength) &&
        contentLength !== options.expectedByteLength
      ) {
        throw new ServiceError(
          'INVALID_RESPONSE',
          `Content-Length ${contentLength} does not match expected ${options.expectedByteLength}`,
        );
      }
      const body = await response.arrayBuffer();
      if (options.expectedByteLength !== undefined && body.byteLength !== options.expectedByteLength) {
        throw new ServiceError(
          'INVALID_RESPONSE',
          `Binary response length ${body.byteLength} does not match expected ${options.expectedByteLength}`,
        );
      }
      return { status: response.status, headers: response.headers, body };
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (controller.signal.aborted) {
        const callerAborted = options.signal?.aborted || controller.signal.reason === 'caller';
        throw new ServiceError(
          callerAborted ? 'ABORTED' : 'TIMEOUT',
          callerAborted ? 'Request aborted' : `Request timed out after ${timeoutMs}ms`,
          undefined,
          { cause: error },
        );
      }
      throw new ServiceError('NETWORK', `Network error while requesting ${parsedUrl}`, undefined, { cause: error });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
}
