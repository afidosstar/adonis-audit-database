import {
  AuditPayload,
  AuditWatcherContract,
  AuditWatcherDecorator,
  AuditWatcherOptions,
} from "@ioc:Adonis/Addons/AuditDatabase";

const AuditWatcher: AuditWatcherContract = function (
  options: AuditWatcherOptions = { guard: "jwt" } as any
): AuditWatcherDecorator {
  return function (Model) {
    Model.boot();
    ["update", "create", "delete"].forEach((event) => {
      Model.$hooks.add("after", event, async function (entity) {
        const HttpContext = (await import("@ioc:Adonis/Core/HttpContext"))
          .default;
        const Event = (await import("@ioc:Adonis/Core/Event")).default;
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
};

export default AuditWatcher;
