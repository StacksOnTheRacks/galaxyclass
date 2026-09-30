import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createProfileStore, type ProfileStore } from '../profile-store.js';

let cached: ProfileStore | undefined;

export function profileStoreFromEnv(): ProfileStore {
  if (!cached) {
    const tableName = process.env.PROFILE_TABLE_NAME;
    if (!tableName) {
      throw new Error('PROFILE_TABLE_NAME is not set');
    }
    cached = createProfileStore({
      client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
      tableName,
    });
  }
  return cached;
}
