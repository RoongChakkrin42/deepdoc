import { Document } from 'mongoose';

export interface AuthConsumer extends Document {
  body: AuthConsumerBody;
}

interface AuthConsumerBody {
  username: string;
  password: string;
}
