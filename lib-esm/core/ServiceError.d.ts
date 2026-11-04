export type ServiceErrorCode = 'NETWORK' | 'HTTP' | 'TIMEOUT' | 'ABORTED' | 'INVALID_RESPONSE' | 'NOT_FOUND';
export declare class ServiceError extends Error {
    readonly code: ServiceErrorCode;
    readonly status?: number | undefined;
    constructor(code: ServiceErrorCode, message: string, status?: number | undefined, options?: ErrorOptions);
}
