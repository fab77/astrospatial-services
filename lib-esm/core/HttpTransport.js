import { ServiceError } from "./ServiceError.js";
export class FetchHttpTransport {
    fetchImpl;
    constructor(fetchImpl = fetch) {
        this.fetchImpl = fetchImpl;
    }
    async getText(url, options = {}) {
        const response = await this.request(url, { ...options, method: "GET" });
        return response.body;
    }
    async request(url, options = {}) {
        const timeoutMs = options.timeoutMs ?? 10000;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            throw new RangeError("timeoutMs must be a positive finite number");
        }
        const method = options.method ?? "GET";
        if (method === "GET" && options.body !== undefined) {
            throw new TypeError("GET requests cannot have a body");
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
        const onAbort = () => controller.abort("caller");
        options.signal?.addEventListener("abort", onAbort, { once: true });
        if (options.signal?.aborted)
            controller.abort("caller");
        try {
            const response = await this.fetchImpl(url, {
                method,
                headers: options.headers,
                body: options.body,
                signal: controller.signal,
            });
            if (!response.ok)
                throw new ServiceError("HTTP", `HTTP ${response.status} for ${url}`, response.status);
            return {
                status: response.status,
                headers: response.headers,
                body: await response.text(),
            };
        }
        catch (error) {
            if (error instanceof ServiceError)
                throw error;
            if (controller.signal.aborted) {
                const callerAborted = options.signal?.aborted || controller.signal.reason === "caller";
                throw new ServiceError(callerAborted ? "ABORTED" : "TIMEOUT", callerAborted
                    ? "Request aborted"
                    : `Request timed out after ${timeoutMs}ms`, undefined, { cause: error });
            }
            throw new ServiceError("NETWORK", `Network error while requesting ${url}`, undefined, { cause: error });
        }
        finally {
            clearTimeout(timeout);
            options.signal?.removeEventListener("abort", onAbort);
        }
    }
}
