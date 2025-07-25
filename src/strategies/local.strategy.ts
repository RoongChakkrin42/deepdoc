import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local'
import { AppService } from 'src/app.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {

  constructor(private appService: AppService) {
    super();
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.appService.validateUser(username, password);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
