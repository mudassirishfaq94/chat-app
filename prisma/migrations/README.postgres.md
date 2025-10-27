# Prisma Migrations (Postgres Baseline)

This directory has been reset for Postgres. The baseline migration is:

- `20251027_init_postgres/migration.sql`

Previous SQLite-oriented migrations were removed to avoid incompatibilities. For production deployments, apply migrations with:

```
npm run migrate
```

Ensure `DATABASE_URL` points to a Postgres database.