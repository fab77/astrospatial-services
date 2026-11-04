export interface HttpTransport {
    getText(url: string, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<string>;
}
export declare class FetchHttpTransport implements HttpTransport {
    private readonly fetchImpl;
    constructor(fetchImpl?: typeof fetch);
    getText(url: string, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<string>;
}
