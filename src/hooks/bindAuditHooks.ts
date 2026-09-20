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

/** Qui agit, d'où, et sous quel libellé : partagé par les hooks et les helpers bulk. */
export interface AuditActor {
  userId: number | string | null;
  fullName: string | null;
  origin: string;
  service?: string;
  requestId?: string;
  endpoint?: string;
  intent?: string;
  route?: any;
  request?: any;
}

/**
 * Résout l'acteur courant. Renvoie `null` quand l'événement doit être ignoré :
 * requête HTTP (ou hors de tout contexte) sans utilisateur identifié, sauf
 * `audit.auditAnonymous`. Un contexte explicite non-HTTP (commande, tâche,
 * worker, migration) est toujours audité, c'est précisément son rôle.
 */
export async function resolveAuditActor(
  container: IocContract,
  fallbackService?: string
): Promise<AuditActor | null> {
  const Config = container.use("Adonis/Core/Config");
  const context = AuditExecutionContext.get();

  let route: any = context?.route;
  let request: any;
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
      route = ctx.route;
      request = ctx.request;
    }
  }

  const origin = context?.origin ?? (route ? "http" : "unknown");
  const anonymousAllowed =
    Config.get("audit.auditAnonymous", false) ||
    (context !== undefined && origin !== "http");

  if ((userId === null || userId === undefined) && !anonymousAllowed) {
    return null;
  }

  const labelPath = Config.get(
    "audit.metaLabelPath",
    "routePermission.description"
  );
  const intent =
    getByPath(route?.meta, labelPath) ??
    // clé historique (avant correction du bug) conservée pour compatibilité
    getByPath(route?.meta, "authorizeDescriptor.description");

  return {
    userId: userId ?? null,
    fullName: fullName ?? null,
    origin,
    service: context?.service ?? fallbackService,
    requestId: context?.requestId,
    endpoint:
      context?.endpoint ??
      (request ? `${request.intended()} ${request.url()}` : undefined),
    intent,
    route,
    request,
  };
}

/**
 * Exécute `emit` maintenant, ou seulement au commit de `client` si c'est une
 * transaction et que `audit.deferToTransactionCommit` est actif (défaut).
 */
export function emitAfterCommit(
  container: IocContract,
  client: any,
  emit: () => Promise<void>
): Promise<void> | void {
  const Config = container.use("Adonis/Core/Config");
  const deferToCommit = Config.get("audit.deferToTransactionCommit", true);
  if (
    deferToCommit &&
    client?.isTransaction &&
    typeof client.after === "function"
  ) {
    client.after("commit", emit);
    return;
  }
  return emit();
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

      // Suppression logique (adonis-lucid-soft-deletes) : delete() fait un
      // save() qui a déjà émis "soft_delete" via le hook update ; on ignore
      // le hook delete pour ne pas journaliser deux fois.
      if (event === "delete" && isSoftDeleted(container, entity)) {
        return;
      }

      await emitAfterCommit(container, entity.$trx, () =>
        emitAuditEvent(container, Model, entity, event, before, options)
      );
    });
  });
}

function softDeleteColumn(container: IocContract): string {
  return container
    .use("Adonis/Core/Config")
    .get("audit.softDeleteColumn", "deletedAt");
}

function isSoftDeleted(container: IocContract, entity: any): boolean {
  const column = softDeleteColumn(container);
  const value = entity?.$attributes?.[column];
  return value !== undefined && value !== null;
}

// Colonnes techniques mises à jour en même temps qu'une suppression logique.
const TECHNICAL_COLUMNS = [
  "updatedAt",
  "updated_at",
  "updatedBy",
  "updated_by",
];

/** "soft_delete" / "restore" quand seule la colonne de suppression logique change. */
function labelSoftDelete(
  container: IocContract,
  changed: string[] | undefined,
  after: Record<string, any> | undefined
): string | undefined {
  const column = softDeleteColumn(container);
  if (!changed || !after || !changed.includes(column)) {
    return undefined;
  }
  const onlyTechnical = changed.every(
    (key) => key === column || TECHNICAL_COLUMNS.includes(key)
  );
  if (!onlyTechnical) {
    return undefined;
  }
  return after[column] === null || after[column] === undefined
    ? "restore"
    : "soft_delete";
}

async function emitAuditEvent(
  container: IocContract,
  Model: LucidModel,
  entity: any,
  event: AuditableEvent,
  before: Record<string, any> | undefined,
  options: BindAuditHooksOptions
): Promise<void> {
  const actor = await resolveAuditActor(
    container,
    options.service ?? Model.name
  );
  if (!actor) {
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

  const Event = container.use("Adonis/Core/Event");
  await Event.emit("adonis:audit:data", {
    table: Model.table,
    event: labelSoftDelete(container, changed, after) ?? event,
    data: entity.toJSON(),
    before,
    after,
    changed,
    user: { id: actor.userId, full_name: actor.fullName },
    userId: actor.userId,
    fullName: actor.fullName,
    origin: actor.origin,
    service: actor.service,
    requestId: actor.requestId,
    endpoint: actor.endpoint,
    route: actor.route,
    request: actor.request,
    intent: actor.intent,
  } as any);
}
