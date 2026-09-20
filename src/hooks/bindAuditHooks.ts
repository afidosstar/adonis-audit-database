/*
 * @project adonis-audit-database
 *
 * Logique commune d'audit d'un modèle Lucid : posée soit via le décorateur
 * `@AuditWatcher()` (un modèle à la fois), soit en l'appelant directement
 * depuis un mixin de base partagé par tous les modèles du projet
 * consommateur (couverture automatique, sans décorateur à répéter partout).
 */
import { IocContract } from "@adonisjs/fold";
import { LucidModel } from "@ioc:Adonis/Lucid/Orm";
import AuditExecutionContext from "../context/AuditExecutionContext";
import getByPath from "../utils/getByPath";
import resolveUserId from "../utils/resolveUserId";
import resolveUserDisplayName from "../utils/resolveUserDisplayName";

export type AuditableEvent = "create" | "update" | "delete";

export interface BindAuditHooksOptions {
  /** Nom de service à défaut si le contexte d'exécution n'en fournit pas. */
  service?: string;
  /** Sous-ensemble d'événements à auditer (par défaut : les trois). */
  events?: AuditableEvent[];
}

// Snapshot du $dirty/$original pris dans le hook "before update", car Lucid
// vide $dirty et aligne $original sur $attributes avant que le hook "after
// update" ne s'exécute (BaseModel#update : hydrateOriginals() puis hooks.exec('after','update')).
const beforeUpdateSnapshots = new WeakMap<object, Record<string, any>>();

export default function bindAuditHooks(
  Model: LucidModel,
  container: IocContract,
  options: BindAuditHooksOptions = {}
): void {
  Model.boot();

  const events =
    options.events ?? (["create", "update", "delete"] as AuditableEvent[]);

  if (events.includes("update")) {
    Model.$hooks.add("before", "update", function (entity: any) {
      beforeUpdateSnapshots.set(entity, { ...entity.$original });
    });
  }

  events.forEach((event) => {
    Model.$hooks.add("after", event, async function (entity: any) {
      const before =
        event === "update" ? beforeUpdateSnapshots.get(entity) : undefined;
      if (event === "update") {
        beforeUpdateSnapshots.delete(entity);
      }

      const emit = () =>
        emitAuditEvent(container, Model, entity, event, before, options);

      const Config = container.use("Adonis/Core/Config");
      const deferToCommit = Config.get("audit.deferToTransactionCommit", true);

      if (deferToCommit && entity.$trx) {
        entity.$trx.after("commit", emit);
      } else {
        await emit();
      }
    });
  });
}

async function emitAuditEvent(
  container: IocContract,
  Model: LucidModel,
  entity: any,
  event: AuditableEvent,
  before: Record<string, any> | undefined,
  options: BindAuditHooksOptions
): Promise<void> {
  const Config = container.use("Adonis/Core/Config");
  const Event = container.use("Adonis/Core/Event");

  const context = AuditExecutionContext.get();
  let httpRoute: any = context?.route;
  let httpRequest: any;
  let userId: any = context?.userId ?? null;
  let fullName: any = context?.fullName ?? null;

  // Compatibilité ascendante : aucun AuditExecutionContext actif (middleware
  // non installé dans le projet consommateur) -> on retombe sur l'ancien
  // comportement basé sur le HttpContext courant.
  if (!context && container.hasBinding("Adonis/Core/HttpContext")) {
    const HttpContext = container.use("Adonis/Core/HttpContext");
    const ctx = HttpContext.get();
    if (ctx) {
      const user = await ctx.auth?.authenticate().catch(() => null);
      if (user) {
        userId = resolveUserId(user, Config.get("audit.resolveUserId"));
        fullName = resolveUserDisplayName(
          user,
          Config.get("audit.resolveUserDisplayName")
        );
      }
      httpRoute = ctx.route;
      httpRequest = ctx.request;
    }
  }

  const auditAnonymous = Config.get("audit.auditAnonymous", false);
  if ((userId === null || userId === undefined) && !auditAnonymous) {
    return;
  }

  let after: Record<string, any> | undefined;
  let changed: string[] | undefined;

  if (event === "create") {
    after = { ...entity.$attributes } as Record<string, any>;
  } else if (event === "update") {
    const afterSnapshot: Record<string, any> = { ...entity.$attributes };
    const beforeSnapshot = before;
    after = afterSnapshot;
    if (beforeSnapshot) {
      changed = Object.keys(afterSnapshot).filter(
        (key) =>
          JSON.stringify(afterSnapshot[key]) !==
          JSON.stringify(beforeSnapshot[key])
      );
    }
  } else if (event === "delete") {
    before = { ...entity.$attributes } as Record<string, any>;
  }

  const labelPath = Config.get(
    "audit.metaLabelPath",
    "routePermission.description"
  );
  const label =
    getByPath(httpRoute?.meta, labelPath) ??
    // clé historique (avant correction du bug) conservée pour compatibilité
    getByPath(httpRoute?.meta, "authorizeDescriptor.description");

  const payload = {
    table: Model.table,
    event,
    data: entity.toJSON(),
    before,
    after,
    changed,
    user: { id: userId, full_name: fullName },
    userId,
    fullName,
    origin: context?.origin ?? (httpRoute ? "http" : "unknown"),
    service: context?.service ?? options.service ?? Model.name,
    requestId: context?.requestId,
    endpoint:
      context?.endpoint ??
      (httpRequest
        ? `${httpRequest.intended()} ${httpRequest.url()}`
        : undefined),
    route: httpRoute,
    request: httpRequest,
    intent: label,
  };

  await Event.emit("adonis:audit:data", payload as any);
}
