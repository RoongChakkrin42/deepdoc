import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CredentialsDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'username may contain letters, digits, dot, underscore and hyphen only',
  })
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  refresh_token: string;
}
