import { LucidModel, LucidRow } from "@ioc:Adonis/Lucid/Orm";
import { GuardsList } from "@ioc:Adonis/Addons/Auth";
import { AuditPayload } from "@ioc:Adonis/Addons/AuditDatabase";
import HttpContext from "@ioc:Adonis/Core/HttpContext";
import Event from "@ioc:Adonis/Core/Event";

export default function AuditWatcher(
  options: { guard: keyof GuardsList } = { guard: "jwt" } as any
) {
  return function (constructor: Function) {
    const Model = constructor as LucidModel;
    Model.boot();
    ["update", "create", "delete"].forEach((event) => {
      Model.$hooks.add("after", event, async function (entity: LucidRow) {
        const { request, route, auth } = await HttpContext.get()!;
        const user = await (auth.use(options.guard) as any)
          .authenticate()
          .catch(() => null);
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
      });
    });
  };
}
