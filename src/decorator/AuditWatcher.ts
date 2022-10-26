import {
  AuditPayload,
  AuditWatcherContract,
  AuditWatcherDecorator,
} from "@ioc:Adonis/Addons/AuditDatabase";
import { IocContract } from "@adonisjs/fold";

export default function useAuditWatcherDecorator(
  container: IocContract
): AuditWatcherContract {
  return function (): AuditWatcherDecorator {
    return function (Model) {
      Model.boot();
      ["update", "create", "delete"].forEach((event) => {
        Model.$hooks.add("after", event, async function (entity) {
          if (container.hasBinding("Adonis/Core/HttpContext")) {
            const HttpContext = container.use("Adonis/Core/HttpContext");
            const Event = container.use("Adonis/Core/Event");
            const ctx = HttpContext.get();
            if (!ctx) {
              return;
            }
            const { request, route, auth } = ctx;
            const user: any = await auth.authenticate().catch(() => null);
            if (user) {
              const data: AuditPayload = {
                route: route,
                request: request,
                table: Model.table,
                data: entity.toJSON(),
                user: user.toJSON(),
                event: event,
              };
              await Event.emit("adonis:audit:data", data);
            }
          }
        });
      });
    };
  };
}
