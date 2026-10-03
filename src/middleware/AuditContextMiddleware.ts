/*
 * @project adonis-audit-database
 *
 * Middleware global exposé par le provider sous le binding IoC
 * "Adonis/Addons/AuditDatabase/Context". À déclarer dans le kernel.ts du
 * projet consommateur APRÈS le middleware d'authentification (ex: SilentAuth)
 * pour que `auth.user` soit déjà résolu. Peuple le AuditExecutionContext pour
 * toute la durée de la requête HTTP.
 *
 * start/kernel.ts:
 *   Server.middleware.register([
 *     () => import('@ioc:Adonis/Core/BodyParser'),
 *     () => import('App/Middleware/SilentAuth'),
 *     'Adonis/Addons/AuditDatabase/Context',
 *   ])
 *
 * Aucun import `@ioc:` ici : ces alias ne sont pas réécrits dans node_modules,
 * la config est injectée par le provider.
 */
import type { HttpContextContract } from "@ioc:Adonis/Core/HttpContext";
import AuditExecutionContext from "../context/AuditExecutionContext";
import resolveUserId, { UserIdResolver } from "../utils/resolveUserId";
import resolveUserDisplayName, {
  UserDisplayNameResolver,
} from "../utils/resolveUserDisplayName";

export interface AuditContextMiddlewareConfig {
  resolveUserId?: UserIdResolver;
  resolveUserDisplayName?: UserDisplayNameResolver;
  /** Optionnels : renvoient l'administrateur réel en cas d'impersonnalisation. */
  resolveImpersonatorId?: (
    ctx: HttpContextContract
  ) => number | string | null | undefined;
  resolveImpersonatorName?: (
    ctx: HttpContextContract
  ) => string | null | undefined;
}

export default class AuditContextMiddleware {
  constructor(private config: AuditContextMiddlewareConfig = {}) {}

  // Un résolveur défaillant ne doit jamais casser la requête : on ignore l'erreur.
  private safeResolve<T>(
    resolver: ((ctx: HttpContextContract) => T) | undefined,
    ctx: HttpContextContract
  ): T | null {
    if (!resolver) {
      return null;
    }
    try {
      return resolver(ctx) ?? null;
    } catch {
      return null;
    }
  }

  public async handle(
    ctx: HttpContextContract,
    next: () => Promise<void>
  ): Promise<void> {
    const { auth, route, request } = ctx;
    const user: any = auth?.user;

    await AuditExecutionContext.run(
      {
        origin: "http",
        userId: resolveUserId(user, this.config.resolveUserId),
        fullName: resolveUserDisplayName(
          user,
          this.config.resolveUserDisplayName
        ),
        impersonatorId: this.safeResolve(
          this.config.resolveImpersonatorId,
          ctx
        ),
        impersonatorName: this.safeResolve(
          this.config.resolveImpersonatorName,
          ctx
        ),
        route: route
          ? { pattern: route.pattern, name: route.name, meta: route.meta }
          : undefined,
        requestId: request?.id?.(),
        endpoint: request
          ? `${request.intended()} ${request.url()}`
          : undefined,
      },
      next
    );
  }
}
