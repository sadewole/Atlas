import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Example schema — a single `widgets` table.
 *
 * This exists so the package has a real, typed schema to exercise the
 * connection, migrations, and integration tests. Each Atlas service defines
 * its OWN schema (see the "services own their data" principle) and passes it
 * to {@link DatabaseModule.forRoot}.
 */
export const widgets = pgTable('widgets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Widget = typeof widgets.$inferSelect;
export type NewWidget = typeof widgets.$inferInsert;
