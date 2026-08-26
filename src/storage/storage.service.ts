import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
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
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.s3 = new S3Client({
      region: config.get('AWS_REGION', { infer: true }),
      credentials: {
        accessKeyId: config.get('AWS_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY', { infer: true }),
      },
      // The SDK already retries with backoff; the old hand-rolled retry loop
      // on top of this was redundant.
      maxAttempts: 3,
    });
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
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }
}
