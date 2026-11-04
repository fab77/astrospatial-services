export type ServiceErrorCode = 'NETWORK' | 'HTTP' | 'TIMEOUT' | 'ABORTED' | 'INVALID_RESPONSE' | 'NOT_FOUND';

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ServiceError';
  }
}
