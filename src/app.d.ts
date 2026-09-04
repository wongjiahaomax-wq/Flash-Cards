type Auth = ReturnType<typeof import('./lib/server/auth.js').createAuth>;
type AuthSession = Awaited<ReturnType<Auth['api']['getSession']>>;
type Session = NonNullable<AuthSession>['session'];
type User = NonNullable<AuthSession>['user'] & {
  role?: string | null;
};

declare global {
  namespace App {
    interface Locals {
      auth: Auth | null;
      session: Session | null;
      user: User | null;
    }

    interface Platform {
      env: Cloudflare.Env & {
        BETTER_AUTH_SECRET: string;
        BETTER_AUTH_URL?: string;
        PREVIEW_MODE?: string;
        SYSTEM_STUDY_NAVIGATION_ENABLED?: string;
        LEARNER_RUNTIME_WRITE_FENCE?: string;
        APP_BUILD_SHA?: string;
      };
      cf?: CfProperties;
      ctx?: ExecutionContext;
      caches?: CacheStorage;
    }
  }
}

export {};
