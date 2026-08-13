// The Deno globals these edge functions actually use, and no more.
//
// Supabase runs them on Deno, which supplies these at runtime; `tsc` has never
// heard of them. Declaring the two we touch is what lets the repository's own
// TypeScript check this directory without adding a second toolchain — see
// tsconfig.json in this folder for what that check does and does not prove.
//
// Deliberately narrow: if a function starts reading files or opening sockets,
// this file should fail to compile rather than quietly widen.

declare namespace Deno {
  /** Edge function configuration. Every value arrives as a string or not at all. */
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
    toObject(): Record<string, string>;
  };

  /** The HTTP entry point. Supabase invokes the handler per request. */
  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
  export function serve(
    options: { port?: number; hostname?: string; signal?: AbortSignal },
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}
