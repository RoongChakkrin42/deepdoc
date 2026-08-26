import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Both transforms resolve their own fallback rather than relying on the class
 * property initialiser. class-transformer runs `@Transform` before applying
 * default values, so a transform that returns `undefined` for an unset
 * variable wins over the initialiser — which silently turned an unset
 * CORS_ORIGINS into `origin: undefined`, i.e. "allow every origin".
 */
const isBlank = (value: unknown) =>
  value === undefined || value === null || value === '';

const toInt = (fallback: number) =>
  Transform(({ value }) => (isBlank(value) ? fallback : Number(value)));

const toBool = (fallback: boolean) =>
  Transform(({ value }): boolean =>
    isBlank(value) ? fallback : value === true || value === 'true',
  );

const toList = (fallback: string[]) =>
  Transform(({ value }): string[] => {
    if (isBlank(value)) return fallback;
    if (Array.isArray(value)) return value as string[];
    return String(value)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  });

const withDefault = <T>(fallback: T) =>
  Transform(({ value }): T => (isBlank(value) ? fallback : (value as T)));

export class EnvironmentVariables {
  @withDefault(NodeEnv.Development)
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @toInt(8000)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 8000;

  @IsString()
  @IsNotEmpty()
  MONGODB_URI: string;

  @IsString()
  @MinLength(16, {
    message:
      'JWT_SECRET must be at least 16 characters. Generate one with: openssl rand -base64 32',
  })
  JWT_SECRET: string;

  @withDefault('2h')
  @IsString()
  JWT_ACCESS_TTL = '2h';

  @withDefault('7d')
  @IsString()
  JWT_REFRESH_TTL = '7d';

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @withDefault('gemini-3.6-flash')
  @IsString()
  GEMINI_MODEL = 'gemini-3.6-flash';

  @IsString()
  @IsNotEmpty()
  AWS_REGION: string;

  @IsString()
  @IsNotEmpty()
  AWS_ACCESS_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  AWS_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsNotEmpty()
  S3_BUCKET: string;

  /**
   * Overrides the AWS endpoint so an S3-compatible store (MinIO, R2) can be
   * used instead. Left unset, the SDK resolves the real AWS endpoint from
   * `AWS_REGION` and the deployment behaves exactly as it did before.
   *
   * This is the address the *server* uses: in Kubernetes it is the in-cluster
   * Service, e.g. `http://minio.deepdoc.svc.cluster.local:9000`.
   */
  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  /**
   * The address presigned download URLs are signed for.
   *
   * SigV4 signs the Host header, so a URL signed for an in-cluster hostname is
   * both unreachable from a browser and impossible for a proxy to rewrite —
   * changing the host invalidates the signature. Reviewers open these links
   * directly, so presigning needs a publicly resolvable endpoint even when
   * uploads and downloads go over the internal one.
   *
   * Falls back to `S3_ENDPOINT` when the two are the same.
   */
  @IsOptional()
  @IsString()
  S3_PUBLIC_ENDPOINT?: string;

  /**
   * Path-style addressing (`https://host/bucket/key`) rather than virtual-host
   * style (`https://bucket.host/key`). Required by MinIO; leave false for AWS.
   */
  @toBool(false)
  @IsBoolean()
  S3_FORCE_PATH_STYLE = false;

  /** Comma-separated list of allowed browser origins. */
  @toList(['http://localhost:3000'])
  @IsString({ each: true })
  @ArrayNotEmpty()
  CORS_ORIGINS: string[] = ['http://localhost:3000'];

  /** Per-file upload ceiling, in megabytes. */
  @toInt(10)
  @IsInt()
  @Min(1)
  MAX_UPLOAD_MB = 10;

  /**
   * Ceiling on the total bytes of PDF sent to Gemini in one request.
   * The Gemini inline-data path caps a request at 20 MB, so stay under it.
   */
  @toInt(18)
  @IsInt()
  @Min(1)
  @Max(19)
  GEMINI_MAX_PAYLOAD_MB = 18;

  /** How many times an analysis is attempted before it is marked failed. */
  @toInt(3)
  @IsInt()
  @Min(1)
  @Max(10)
  ANALYSIS_MAX_ATTEMPTS = 3;
}

/**
 * Fails fast at boot rather than at the first request. A missing GEMINI_API_KEY
 * used to surface as a silent background analysis failure hours later.
 */
export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return config;
}
