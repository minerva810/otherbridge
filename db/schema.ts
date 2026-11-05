import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';

export const walletCache=sqliteTable('wallet_cache',{
  address:text('address').primaryKey(),
  payload:text('payload').notNull(),
  updatedAt:text('updated_at').notNull(),
});
export const metadataCache=sqliteTable('metadata_cache',{
  id:text('id').primaryKey(),
  payload:text('payload').notNull(),
  updatedAt:text('updated_at').notNull(),
});
export const bridgeEvents=sqliteTable('bridge_events',{
  id:integer('id').primaryKey({autoIncrement:true}),
  sessionId:text('session_id').notNull(),
  eventName:text('event_name').notNull(),
  payload:text('payload').notNull(),
  createdAt:text('created_at').notNull(),
});
