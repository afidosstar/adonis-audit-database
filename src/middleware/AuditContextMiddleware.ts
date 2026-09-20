/*
 * @project adonis-audit-database
 *
 * Middleware global à déclarer dans le kernel.ts du projet consommateur,
 * APRÈS le middleware d'authentification (ex: SilentAuth), pour que
 * `auth.user` soit déjà résolu. Peuple le AuditExecutionContext pour toute
 * la durée de la requête HTTP.
 *
 * start/kernel.ts:
 *   Server.middleware.register([
 *     () => import('@ioc:Adonis/Core/BodyParser'),
 *     () => import('App/Middleware/SilentAuth'),
 *     () => import('@fickou/adonis-audit-database/build/src/middleware/AuditContextMiddleware'),
 *   ])
 */
import type { HttpContextContract } from "@ioc:Adonis/Core/HttpContext";
import Config from "@ioc:Adonis/Core/Config";
import AuditExecutionContext from "../context/AuditExecutionContext";
import resolveUserId from "../utils/resolveUserId";
import resolveUserDisplayName from "../utils/resolveUserDisplayName";

export default class AuditContextMiddleware {
  public async handle(
    ctx: HttpContextContract,
    next: () => Promise<void>
  ): Promise<void> {
    const { auth, route, request } = ctx;
    const user: any = auth?.user;

    await AuditExecutionContext.run(
      {
        origin: "http",
        userId: resolveUserId(user, Config.get("audit.resolveUserId")),
        fullName: resolveUserDisplayName(
          user,
          Config.get("audit.resolveUserDisplayName")
        ),
        route: route
          ? { pattern: route.pattern, name: route.name, meta: route.meta }
          : undefined,
        requestId: request?.id?.(),
      },
      next
    );
  }
}
