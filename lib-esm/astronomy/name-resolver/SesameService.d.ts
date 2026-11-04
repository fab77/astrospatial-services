import { type HttpTransport } from '../../core/HttpTransport.js';
export interface ResolvedTarget {
    name: string;
    raDeg: number;
    decDeg: number;
    resolver?: string;
}
export interface NameResolver {
    resolve(name: string, options?: {
        signal?: AbortSignal;
    }): Promise<ResolvedTarget | null>;
}
export interface SesameServiceOptions {
    endpoint?: string;
    timeoutMs?: number;
    transport?: HttpTransport;
}
/** CDS Sesame XML resolver; coordinates are decimal degrees (ICRS/J2000 as supplied by CDS). */
export declare class SesameService implements NameResolver {
    private readonly endpoint;
    private readonly timeoutMs;
    private readonly transport;
    constructor(options?: SesameServiceOptions);
    resolve(name: string, options?: {
        signal?: AbortSignal;
    }): Promise<ResolvedTarget | null>;
}
/** Parse Sesame's <Target><Resolver><jradeg>/<jdedeg> XML without browser-only DOMParser. */
export declare function parseSesameXml(xml: string, name: string): ResolvedTarget | null;
