import { Client, Account, TablesDB, Storage, Realtime } from 'appwrite';
import { DATABASE_ID } from './constants';

const client = new Client()
  .setEndpoint(process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || '')
  .setProject(process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || '');

export const account = new Account(client);
export const tablesDB = new TablesDB(client);
export const storage = new Storage(client);
export const realtime = new Realtime(client);

export { client };
