/**
 * Creates a reviewer account from the command line.
 *
 *   npm run seed:reviewer       -- --username reviewer --password 'a-strong-password'
 *   npm run seed:reviewer:prod  -- --username reviewer --password 'a-strong-password'
 *
 * `POST /auth/register` can do the same thing, but it is open on purpose for
 * the demo and needs the API already running — which makes "how do I get an
 * account to look at the results?" a question with a curl command for an
 * answer. This boots only the Mongo connection and the auth stack (see
 * `SeedModule`), so it works against a cold database and never touches the
 * analysis pipeline.
 *
 * The `:prod` variant runs the compiled `dist/` output, which is what the
 * container image ships — `ts-node` and `tsconfig-paths` are devDependencies
 * and are not installed there.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { SeedModule } from './seed.module';

interface Args {
  username: string;
  password: string;
}

/** Parses `--username x --password y`, also accepting `--username=x`. */
function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const [flag, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    const value = inlineValue ?? argv[++i];
    if (value !== undefined) values.set(flag, value);
  }

  const username = (values.get('username') ?? '').trim();
  const password = values.get('password') ?? '';

  const problems: string[] = [];
  if (username.length < 3) {
    problems.push('--username ต้องยาวอย่างน้อย 3 ตัวอักษร');
  }
  if (password.length < 8) {
    problems.push('--password ต้องยาวอย่างน้อย 8 ตัวอักษร');
  }
  if (problems.length > 0) {
    throw new Error(
      [
        ...problems,
        '',
        "ตัวอย่าง: npm run seed:reviewer -- --username reviewer --password 'a-strong-password'",
      ].join('\n'),
    );
  }

  return { username, password };
}

async function main(): Promise<void> {
  const { username, password } = parseArgs(process.argv.slice(2));
  const logger = new Logger('SeedReviewer');

  // `logger: false` keeps the Nest boot banner out of the way; the script's own
  // output is the only thing worth reading here.
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn'],
  });

  try {
    const auth = app.get(AuthService);
    const user = await auth.register(username, password);
    logger.log(`สร้างบัญชีผู้ตรวจ "${user.username}" เรียบร้อย`);
    logger.log('เข้าสู่ระบบที่หน้า /results ของ client ด้วยบัญชีนี้ได้เลย');
  } finally {
    await app.close();
  }
}

main().catch((error: Error) => {
  // The account already existing is the common case on a re-run, and it is not
  // an incident — say so plainly and still exit non-zero.
  console.error(`\nสร้างบัญชีไม่สำเร็จ: ${error.message}\n`);
  process.exitCode = 1;
});
