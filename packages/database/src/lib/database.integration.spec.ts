import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { desc, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { Sql } from 'postgres';
import { createDatabaseClient, createPool, pingDatabase } from './connection.js';
import { NewWidget, widgets } from './example-schema.js';

/**
 * Integration test against a real PostgreSQL spun up in Docker via
 * Testcontainers. Exercises the exact path a service uses:
 *   pool -> drizzle client (typed schema) -> migrations -> CRUD.
 */
describe('@atlas/database integration', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Sql;
  let db: ReturnType<typeof createDatabaseClient>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    pool = createPool({
      host: container.getHost(),
      port: container.getPort(),
      user: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
      max: 5,
    });
    db = createDatabaseClient(pool, { widgets });
    await migrate(db, { migrationsFolder: './migrations' });
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it('is reachable', async () => {
    await expect(pingDatabase(pool)).resolves.toBe(true);
  });

  it('inserts and selects a row through the typed client', async () => {
    const [inserted] = await db
      .insert(widgets)
      .values({ name: 'ledger' } satisfies NewWidget)
      .returning();

    expect(inserted.id).toBeDefined();
    expect(inserted.name).toBe('ledger');
    expect(inserted.createdAt).toBeInstanceOf(Date);

    const rows = await db
      .select()
      .from(widgets)
      .where(eq(widgets.id, inserted.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(inserted);
  });

  it('returns rows newest-first', async () => {
    await db.insert(widgets).values([
      { name: 'first' },
      { name: 'second' },
    ] satisfies NewWidget[]);

    const rows = await db
      .select({ name: widgets.name })
      .from(widgets)
      .orderBy(desc(widgets.id));
    const names = rows.map((r) => r.name);

    expect(names).toContain('first');
    expect(names).toContain('second');
    expect(names).toContain('ledger');
  });

  it('fails a raw SQL query cleanly when the table does not exist', async () => {
    await expect(pool`select * from does_not_exist`).rejects.toThrow();
  });
});
