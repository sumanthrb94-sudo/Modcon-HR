// Deno resolves imports by URL. `tsc` does not fetch them, so the one remote
// module these functions import is declared here.
//
// This is a shim, not the real supabase-js typings, and the distinction
// matters when reading a green type-check: it verifies that our own code is
// internally consistent — that the builder is called with the right shapes and
// its result destructured correctly — not that a column name exists or that a
// generated table type matches the database. Row data is `any` on purpose;
// pretending otherwise would put a type-level guarantee behind an assertion
// nothing checks.
//
// Keep the version in the module specifier identical to the import in
// _shared/ingest.ts. TypeScript matches these declarations by exact string, so
// bumping the import without bumping this line reports the module as missing —
// which is the intended failure, not a nuisance.

declare module "https://esm.sh/@supabase/supabase-js@2.45.4" {
  /** What PostgREST returns for every terminal call. */
  export interface PostgrestResponse<T = any> {
    data: T;
    error: { message: string; code?: string; details?: string } | null;
    count?: number | null;
    status?: number;
  }

  /**
   * The chainable query builder, thenable at every step — `await db.from(t)
   * .select().eq(...)` resolves without a terminal call, which is how the
   * dispatcher reads `checkin_due`.
   */
  export interface QueryBuilder<T = any> extends PromiseLike<PostgrestResponse<T>> {
    select(columns?: string): QueryBuilder<T>;
    insert(values: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>;
    update(values: Record<string, unknown>): QueryBuilder<T>;
    upsert(values: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>;
    delete(): QueryBuilder<T>;

    eq(column: string, value: unknown): QueryBuilder<T>;
    neq(column: string, value: unknown): QueryBuilder<T>;
    gt(column: string, value: unknown): QueryBuilder<T>;
    gte(column: string, value: unknown): QueryBuilder<T>;
    lt(column: string, value: unknown): QueryBuilder<T>;
    lte(column: string, value: unknown): QueryBuilder<T>;
    like(column: string, pattern: string): QueryBuilder<T>;
    ilike(column: string, pattern: string): QueryBuilder<T>;
    is(column: string, value: unknown): QueryBuilder<T>;
    in(column: string, values: readonly unknown[]): QueryBuilder<T>;
    contains(column: string, value: unknown): QueryBuilder<T>;
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): QueryBuilder<T>;
    limit(count: number): QueryBuilder<T>;
    range(from: number, to: number): QueryBuilder<T>;

    /** Errors when the filter matches more than one row — the reason employees.email is uniquely indexed. */
    maybeSingle(): PromiseLike<PostgrestResponse<T | null>>;
    single(): PromiseLike<PostgrestResponse<T>>;
  }

  export interface SupabaseClient {
    from(table: string): QueryBuilder;
    rpc(fn: string, params?: Record<string, unknown>): QueryBuilder;
  }

  export interface SupabaseClientOptions {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
      detectSessionInUrl?: boolean;
    };
    global?: { headers?: Record<string, string> };
  }

  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: SupabaseClientOptions,
  ): SupabaseClient;
}
