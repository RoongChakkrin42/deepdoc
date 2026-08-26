import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { EnvironmentVariables } from '../common/config/env.validation';

/** Presigned download links live long enough for a reviewing session. */
const DOWNLOAD_URL_TTL_SECONDS = 6 * 60 * 60;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  /** Talks to the store directly — used for `upload` and `download`. */
  private readonly s3: S3Client;

  /**
   * Signs download URLs for the browser.
   *
   * SigV4 covers the Host header, so a URL signed against an in-cluster
   * endpoint is unreachable from a browser *and* unfixable by a proxy —
   * rewriting the host invalidates the signature. When the server reaches the
   * store over a private address but reviewers open the links over a public
   * one, the two need different clients. With `S3_PUBLIC_ENDPOINT` unset (the
   * AWS case, and the single-endpoint case) this is the same object as `s3`.
   */
  private readonly s3Presign: S3Client;

  private readonly bucket: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });

    const endpoint: string | undefined = config.get('S3_ENDPOINT', {
      infer: true,
    });
    const publicEndpoint: string | undefined =
      config.get('S3_PUBLIC_ENDPOINT', { infer: true }) ?? endpoint;

    const shared: S3ClientConfig = {
      region: config.get('AWS_REGION', { infer: true }),
      credentials: {
        accessKeyId: config.get('AWS_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY', { infer: true }),
      },
      // MinIO serves `host/bucket/key`; AWS defaults to `bucket.host/key`.
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      // The SDK already retries with backoff; the old hand-rolled retry loop
      // on top of this was redundant.
      maxAttempts: 3,
    };

    // Omitting `endpoint` entirely, rather than passing undefined, keeps the
    // SDK on its own AWS endpoint resolution.
    this.s3 = new S3Client(endpoint ? { ...shared, endpoint } : shared);

    this.s3Presign =
      publicEndpoint && publicEndpoint !== endpoint
        ? new S3Client({ ...shared, endpoint: publicEndpoint })
        : this.s3;

    if (endpoint) {
      this.logger.log(
        `S3 endpoint ${endpoint}` +
          (this.s3Presign === this.s3
            ? ''
            : ` (presigning as ${publicEndpoint})`),
      );
    }
  }

  /**
   * Uploads one PDF and returns its object key.
   * Keys are UUID-based: `Date.now()` collided whenever two files in the same
   * submission were uploaded inside the same millisecond, silently overwriting.
   */
  async upload(
    buffer: Buffer,
    mimetype: string,
    prefix = 'submissions',
  ): Promise<string> {
    const key = `${prefix}/${randomUUID()}.pdf`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    this.logger.debug(`Uploaded ${key} (${buffer.length} bytes)`);
    return key;
  }

  /** Fetches an object back into memory — used when (re)running an analysis. */
  async download(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`S3 object ${key} has no body`);
    }

    return Buffer.from(await response.Body.transformToByteArray());
  }

  getDownloadUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.s3Presign,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }
}
