export class ServiceError extends Error {
    code;
    status;
    constructor(code, message, status, options) {
        super(message, options);
        this.code = code;
        this.status = status;
        this.name = 'ServiceError';
    }
}
