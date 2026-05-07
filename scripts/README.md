# Local admin scripts

Scripts for managing the Supabase backend directly from your terminal (or Claude Code) **without depending on Lovable**.

> ⚠️ All scripts use the **service_role key**, which bypasses RLS and has full DB access. Never run them in a browser or commit credentials.

## Setup (one-time)

See [`../CLAUDE_LOCAL_SETUP.md`](../CLAUDE_LOCAL_SETUP.md).

Quick version:
```bash
# Create ~/.verisure-admin.env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# SUPABASE_ANON_KEY, SUPABASE_DB_URL — then load it:
set -a; source ~/.verisure-admin.env; set +a
```

## Scripts

| Script | Purpose |
|---|---|
| `create-admin.ts` | Create the first admin user |
| `create-user.ts` | Create a user with any role (`admin` / `data_manager` / `sbc`) |
| `db-query.ts` | Quick PostgREST select against any table (bypasses RLS) |
| `seed-catalogs.ts` | Seed `branches`, `phone_models`, `tablet_models`, `equipment_prices` |

## Examples

```bash
# Create the first admin
bun scripts/create-admin.ts admin@verisure.nl 'StrongPass123!' 'Admin User'

# Create a data manager
bun scripts/create-user.ts dm@verisure.nl 'Pass1234!' 'Data Manager' data_manager

# Create an SBC tied to branch 12
bun scripts/create-user.ts sbc@verisure.nl 'Pass1234!' 'SBC User' sbc 12

# Inspect data
bun scripts/db-query.ts people "id,pers_id,sales_name" 10
bun scripts/db-query.ts user_roles

# Raw SQL via psql
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM equipment_transactions;"

# Apply a new migration manually
psql "$SUPABASE_DB_URL" -f supabase/migrations/<filename>.sql
```
