import { FetchHttpTransport } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';
/** CDS Sesame XML resolver; coordinates are decimal degrees (ICRS/J2000 as supplied by CDS). */
export class SesameService {
    endpoint;
    timeoutMs;
    transport;
    constructor(options = {}) {
        this.endpoint = options.endpoint ?? 'https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame/-ox?';
        this.timeoutMs = options.timeoutMs ?? 10000;
        this.transport = options.transport ?? new FetchHttpTransport();
    }
    async resolve(name, options = {}) {
        if (!name.trim())
            throw new TypeError('Target name must not be empty');
        const raw = await this.transport.getText(this.endpoint + encodeURIComponent(name.trim()), {
            signal: options.signal,
            timeoutMs: this.timeoutMs,
        });
        return parseSesameXml(raw, name.trim());
    }
}
/** Parse Sesame's <Target><Resolver><jradeg>/<jdedeg> XML without browser-only DOMParser. */
export function parseSesameXml(xml, name) {
    if (!xml.trim() || !/<Sesame(?:\s|>)/i.test(xml)) {
        throw new ServiceError('INVALID_RESPONSE', 'Unexpected Sesame XML response');
    }
    const targets = [...xml.matchAll(/<Target(?:\s[^>]*)?>([\s\S]*?)<\/Target>/gi)];
    for (const target of targets) {
        const resolvers = [...target[1].matchAll(/<Resolver(?:\s([^>]*))?>([\s\S]*?)<\/Resolver>/gi)];
        for (const resolver of resolvers) {
            const raText = resolver[2].match(/<jradeg(?:\s[^>]*)?>\s*([^<]+)\s*<\/jradeg>/i)?.[1];
            const decText = resolver[2].match(/<jdedeg(?:\s[^>]*)?>\s*([^<]+)\s*<\/jdedeg>/i)?.[1];
            if (raText === undefined || decText === undefined)
                continue;
            const raDeg = Number(raText.trim());
            const decDeg = Number(decText.trim());
            if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg) || raDeg < 0 || raDeg >= 360 || decDeg < -90 || decDeg > 90)
                continue;
            const resolverName = resolver[1]?.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
            return { name, raDeg, decDeg, ...(resolverName ? { resolver: resolverName } : {}) };
        }
    }
    return null;
}
