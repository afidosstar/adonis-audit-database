/*
 * @project adonis-audit-database
 *
 * Relations many-to-many : `related('roles').sync()/attach()/detach()`
 * écrivent directement dans la table pivot, sans aucun hook Lucid. Ces
 * helpers exécutent l'opération et journalisent UNE entrée sur la table
 * pivot : identifiants liés avant / après, ajoutés / retirés.
 *
 * `related` est le client de relation obtenu par `instance.related('xxx')`.
 */
import { IocContract } from "@adonisjs/fold";
import { emitAfterCommit, resolveAuditActor } from "../hooks/bindAuditHooks";

export type PivotAction = "sync" | "attach" | "detach";

export interface AuditedPivotOptions {
  /** Table pivot ; déduite de la relation par défaut. */
  table?: string;
  service?: string;
  intent?: string;
}

function idsOf(rows: Record<string, any>[], key: string): any[] {
  return rows.map((row) => row[key]).sort();
}

export async function auditedPivot(
  container: IocContract,
  related: any,
  action: PivotAction,
  ids?: any,
  options: AuditedPivotOptions = {}
): Promise<void> {
  const relation = related?.relation ?? {};
  const table = options.table ?? relation.pivotTable;
  if (!table) {
    throw new Error(
      "[adonis-audit-database] impossible de déduire la table pivot : passez options.table"
    );
  }
  const relatedKey: string = relation.pivotRelatedForeignKey ?? "related_id";
  const parent = related?.parent;
  const client = related?.client ?? parent?.$trx;

  const before = await related.pivotQuery().select("*");
  await related[action](ids);
  const after = await related.pivotQuery().select("*");

  const idsBefore = idsOf(before, relatedKey);
  const idsAfter = idsOf(after, relatedKey);
  const added = idsAfter.filter((id) => !idsBefore.includes(id));
  const removed = idsBefore.filter((id) => !idsAfter.includes(id));

  await emitAfterCommit(container, client, async () => {
    const actor = await resolveAuditActor(container, options.service);
    if (!actor) {
      return;
    }
    const Event = container.use("Adonis/Core/Event");
    await Event.emit("adonis:audit:data", {
      table,
      event: `pivot_${action}`,
      data: {
        action,
        parent: {
          table: parent?.constructor?.table,
          id: parent?.$primaryKeyValue,
        },
        added,
        removed,
      },
      before: { [relatedKey]: idsBefore },
      after: { [relatedKey]: idsAfter },
      changed: added.length || removed.length ? [relatedKey] : [],
      user: { id: actor.userId, full_name: actor.fullName },
      userId: actor.userId,
      fullName: actor.fullName,
      origin: actor.origin,
      service: actor.service,
      requestId: actor.requestId,
      endpoint: actor.endpoint,
      route: actor.route,
      request: actor.request,
      intent: options.intent ?? actor.intent,
      bulk: true,
    } as any);
  });
}
