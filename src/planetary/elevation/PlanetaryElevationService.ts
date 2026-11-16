import { FetchBinaryHttpTransport, type BinaryHttpTransport } from '../../core/BinaryHttpTransport.js';
import { FetchHttpTransport, type HttpTransport } from '../../core/HttpTransport.js';
import { ServiceError } from '../../core/ServiceError.js';
import {
  OFFICIAL_ELEVATION_PRODUCTS,
  type OfficialElevationProduct,
} from '../catalog/OfficialElevationCatalog.js';
import { decodeLolaGdr, type DecodedLolaGdr } from './LolaGdrDecoder.js';

export interface PlanetaryElevationServiceOptions {
  textTransport?: HttpTransport;
  binaryTransport?: BinaryHttpTransport;
  timeoutMs?: number;
  products?: readonly OfficialElevationProduct[];
}

export interface ElevationAcquisitionOptions {
  signal?: AbortSignal;
}

export interface LoadedElevationProduct {
  product: OfficialElevationProduct;
  decoded: DecodedLolaGdr;
}

/** Acquire a curated official product and return its normalized elevation field. */
export class PlanetaryElevationService {
  private readonly textTransport: HttpTransport;
  private readonly binaryTransport: BinaryHttpTransport;
  private readonly timeoutMs: number;
  private readonly products: readonly OfficialElevationProduct[];

  constructor(options: PlanetaryElevationServiceOptions = {}) {
    this.textTransport = options.textTransport ?? new FetchHttpTransport();
    this.binaryTransport = options.binaryTransport ?? new FetchBinaryHttpTransport();
    this.timeoutMs = options.timeoutMs ?? 300000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive finite number');
    }
    this.products = options.products ?? Object.values(OFFICIAL_ELEVATION_PRODUCTS);
  }

  getProduct(id: string): OfficialElevationProduct | undefined {
    return this.products.find((product) => product.id === id);
  }

  async load(
    productId: string,
    options: ElevationAcquisitionOptions = {},
  ): Promise<LoadedElevationProduct> {
    const product = this.getProduct(productId);
    if (!product) throw new ServiceError('NOT_FOUND', `Unknown elevation product: ${productId}`);
    if (product.assets.format !== 'PDS3_IMG') {
      throw new ServiceError('NOT_IMPLEMENTED', `Unsupported elevation format: ${product.assets.format}`);
    }
    const requestOptions = { signal: options.signal, timeoutMs: this.timeoutMs };
    const labelText = await this.textTransport.getText(product.assets.labelUrl, requestOptions);
    const binary = await this.binaryTransport.getArrayBuffer(product.assets.dataUrl, {
      ...requestOptions,
      expectedByteLength: product.assets.byteLength,
      expectedSha256: product.metadata.checksum,
    });
    const decoded = decodeLolaGdr(labelText, binary.body, {
      sourceUrl: product.assets.dataUrl,
      checksum: product.metadata.checksum,
      citation: product.metadata.citation,
    });
    if (decoded.field.metadata.sourceProductId.toLowerCase() !== product.metadata.sourceProductId.toLowerCase()) {
      throw new ServiceError(
        'INVALID_RESPONSE',
        `Downloaded product ${decoded.field.metadata.sourceProductId} does not match catalog ${product.metadata.sourceProductId}`,
      );
    }
    return { product, decoded };
  }
}
