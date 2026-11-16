import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  FetchBinaryHttpTransport,
  type BinaryHttpResponse,
  type BinaryHttpTransport,
  type BinaryRequestOptions,
} from '../../core/BinaryHttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';

export interface CachedBinaryHttpTransportOptions {
  cacheDir: string;
  upstream?: BinaryHttpTransport;
}

function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export function binaryCachePath(cacheDir: string, url: string): string {
  return path.join(path.resolve(cacheDir), `${cacheKey(url)}.bin`);
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Node-only, atomic filesystem cache for large immutable binary products. */
export class CachedBinaryHttpTransport implements BinaryHttpTransport {
  private readonly cacheDir: string;
  private readonly upstream: BinaryHttpTransport;
  private readonly pending = new Map<string, Promise<BinaryHttpResponse>>();

  constructor(options: CachedBinaryHttpTransportOptions) {
    if (!options?.cacheDir?.trim()) throw new TypeError('cacheDir is required');
    this.cacheDir = path.resolve(options.cacheDir);
    this.upstream = options.upstream ?? new FetchBinaryHttpTransport();
  }

  async getArrayBuffer(
    url: string,
    options: BinaryRequestOptions = {},
  ): Promise<BinaryHttpResponse> {
    const key = `${url}\n${options.expectedByteLength ?? ''}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.loadOrDownload(url, options).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async loadOrDownload(
    url: string,
    options: BinaryRequestOptions,
  ): Promise<BinaryHttpResponse> {
    await mkdir(this.cacheDir, { recursive: true });
    const filePath = binaryCachePath(this.cacheDir, url);
    const cached = await this.readValidCache(filePath, options.expectedByteLength);
    if (cached) return cached;

    const response = await this.upstream.getArrayBuffer(url, options);
    const bytes = ArrayBuffer.isView(response.body)
      ? new Uint8Array(response.body.buffer, response.body.byteOffset, response.body.byteLength)
      : new Uint8Array(response.body);
    if (options.expectedByteLength !== undefined && bytes.byteLength !== options.expectedByteLength) {
      throw new ServiceError(
        'INVALID_RESPONSE',
        `Downloaded byte length ${bytes.byteLength} does not match expected ${options.expectedByteLength}`,
      );
    }
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, bytes);
      await rename(temporaryPath, filePath);
    } finally {
      await safeUnlink(temporaryPath);
    }
    return response;
  }

  private async readValidCache(
    filePath: string,
    expectedByteLength?: number,
  ): Promise<BinaryHttpResponse | undefined> {
    try {
      const info = await stat(filePath);
      if (!info.isFile() || (expectedByteLength !== undefined && info.size !== expectedByteLength)) {
        await safeUnlink(filePath);
        return undefined;
      }
      const body = await readFile(filePath);
      return {
        status: 200,
        headers: new Headers({
          'content-length': String(body.byteLength),
          'x-astrospatial-cache': 'HIT',
        }),
        body,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
}
