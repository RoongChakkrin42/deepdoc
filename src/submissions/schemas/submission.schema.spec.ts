import { AnalysisStatus, SubmissionSchema } from './submission.schema';
import { UserSchema } from '../../users/user.schema';

/**
 * `SchemaFactory.createForClass` runs at import time, so a bad `@Prop` throws
 * before the app can boot — `CannotDetermineTypeError` on a `string | null`
 * field once took down the whole server, and neither `tsc` nor the service
 * tests noticed because nothing imported the schema.
 *
 * Importing the schemas here is most of the test.
 */
describe('mongoose schemas', () => {
  it('builds the submission schema', () => {
    expect(SubmissionSchema).toBeDefined();
  });

  it('builds the user schema', () => {
    expect(UserSchema).toBeDefined();
  });

  it.each([
    'submitter',
    'report',
    'status',
    'analysis',
    'failureReason',
    'attempts',
    'lastAttemptAt',
  ])('registers the "%s" path', (path) => {
    expect(SubmissionSchema.path(path)).toBeDefined();
  });

  it('defaults a new submission to pending with no analysis', () => {
    expect(SubmissionSchema.path('status').options.default).toBe(
      AnalysisStatus.Pending,
    );
    expect(SubmissionSchema.path('attempts').options.default).toBe(0);
    expect(SubmissionSchema.path('analysis').options.default).toBeNull();
  });

  it('never exposes the password hash by default', () => {
    expect(UserSchema.path('password').options.select).toBe(false);
  });
});
