import { NodeEnv, validateEnv } from './env.validation';

const REQUIRED = {
  MONGODB_URI: 'mongodb://localhost:27017/deepdoc',
  JWT_SECRET: 'a-secret-long-enough-to-pass',
  GEMINI_API_KEY: 'test-key',
  AWS_REGION: 'ap-southeast-1',
  AWS_ACCESS_KEY_ID: 'id',
  AWS_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET: 'bucket',
};

describe('validateEnv', () => {
  it('accepts a minimal valid environment', () => {
    expect(() => validateEnv({ ...REQUIRED })).not.toThrow();
  });

  it('reports every missing variable at once', () => {
    expect(() => validateEnv({})).toThrow(/MONGODB_URI[\s\S]*GEMINI_API_KEY/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...REQUIRED, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
  });

  // An unset CORS_ORIGINS used to survive as `undefined`, which Nest reads as
  // "allow every origin". It must fall back to the localhost default instead.
  it('never leaves CORS_ORIGINS undefined', () => {
    const config = validateEnv({ ...REQUIRED });
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('splits and trims a comma-separated CORS_ORIGINS', () => {
    const config = validateEnv({
      ...REQUIRED,
      CORS_ORIGINS: 'https://a.example , https://b.example',
    });
    expect(config.CORS_ORIGINS).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('applies numeric and string defaults when unset', () => {
    const config = validateEnv({ ...REQUIRED });
    expect(config.PORT).toBe(8000);
    expect(config.MAX_UPLOAD_MB).toBe(10);
    expect(config.GEMINI_MAX_PAYLOAD_MB).toBe(18);
    expect(config.ANALYSIS_MAX_ATTEMPTS).toBe(3);
    expect(config.GEMINI_MODEL).toBe('gemini-3.6-flash');
    expect(config.JWT_ACCESS_TTL).toBe('2h');
    expect(config.NODE_ENV).toBe(NodeEnv.Development);
  });

  it('coerces numeric strings from the environment', () => {
    const config = validateEnv({ ...REQUIRED, PORT: '3001' });
    expect(config.PORT).toBe(3001);
  });

  it('rejects a payload budget above the Gemini inline limit', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, GEMINI_MAX_PAYLOAD_MB: '25' }),
    ).toThrow(/GEMINI_MAX_PAYLOAD_MB/);
  });
});
