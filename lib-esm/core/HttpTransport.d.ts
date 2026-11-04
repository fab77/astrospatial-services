export interface HttpRequestOptions {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface HttpResponse {
    status: number;
    headers: Headers;
    body: string;
}
export interface HttpTransport {
    getText(url: string, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<string>;
    request?(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}
export declare class FetchHttpTransport implements HttpTransport {
    private readonly fetchImpl;
    constructor(fetchImpl?: typeof fetch);
    getText(url: string, options?: {
        signal?: AbortSignal;
        timeoutMs?: number;
    }): Promise<string>;
    request(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}
