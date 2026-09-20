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
}

export default class AuditContextMiddleware {
  constructor(private config: AuditContextMiddlewareConfig = {}) {}

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
