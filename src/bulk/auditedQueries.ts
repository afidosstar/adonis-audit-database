/*
 * @project adonis-audit-database
 *
 * Écritures en masse auditées. Les hooks Lucid ne voient que les instances
 * (`save()`, `delete()`) : `Model.query().update()`, `Database.from().update()`,
 * `.del()` ou `insert()` passent à côté. Ces helpers exécutent l'écriture ET
 * journalisent chaque ligne touchée (état avant / après) tant que le volume
 * reste raisonnable (`audit.bulkRowLimit`, défaut 50), sinon un résumé
 * (nombre de lignes, identifiants).
 *
 * `query` est un query builder Lucid (modèle ou base) déjà filtré, portant sa
 * transaction le cas échéant. Les lignes sont journalisées telles que la base
 * les renvoie (noms de colonnes), contrairement aux hooks d'instance qui
 * journalisent les attributs du modèle.
 */
import { IocContract } from "@adonisjs/fold";
import { emitAfterCommit, resolveAuditActor } from "../hooks/bindAuditHooks";
import redactRow from "../utils/redactRow";

export interface AuditedBulkOptions {
  /** Table journalisée ; déduite du query builder par défaut. */
  table?: string;
  /** Nom du service d'origine si le contexte n'en fournit pas. */
  service?: string;
  /** Libellé métier de l'opération. */
  intent?: string;
  /** Clé primaire pour le résumé ; celle du modèle ou `id` par défaut. */
  primaryKey?: string;
  /** Colonnes dont la valeur est masquée dans le journal (secrets, jetons). */
  redact?: string[];
}

function diffKeys(
  before: Record<string, any>,
  after: Record<string, any>
): string[] {
  return Object.keys(after).filter(
    (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key])
  );
}

type BulkEvent = "create" | "update" | "delete";

interface BulkRow {
  before?: Record<string, any>;
  after?: Record<string, any>;
  changed?: string[];
}

function tableOf(query: any, options: AuditedBulkOptions): string {
  const table =
    options.table ??
    query?.model?.table ??
    query?.knexQuery?._single?.table ??
    query?._single?.table;
  if (!table) {
    throw new Error(
      "[adonis-audit-database] impossible de déduire la table : passez options.table"
    );
  }
  return table;
}

async function selectRows(query: any): Promise<Record<string, any>[]> {
  const clone = query.clone();
  if (typeof clone.pojo === "function") {
    clone.pojo();
  }
  const rows = await clone.select("*");
  return (rows as any[]).map((row) =>
    typeof row?.toJSON === "function" ? row.toJSON() : { ...row }
  );
}

function normalizeCount(result: any, fallback: number): number {
  if (typeof result === "number") {
    return result;
  }
  if (Array.isArray(result)) {
    return typeof result[0] === "number" ? result[0] : result.length;
  }
  return fallback;
}

async function emitBulk(
  container: IocContract,
  client: any,
  event: BulkEvent,
  rows: BulkRow[],
  rowCount: number,
  payload: Record<string, any> | undefined,
  options: AuditedBulkOptions,
  table: string,
  primaryKey: string
): Promise<void> {
  await emitAfterCommit(container, client, async () => {
    const actor = await resolveAuditActor(container, options.service);
    if (!actor) {
      return;
    }
    const Config = container.use("Adonis/Core/Config");
    const Event = container.use("Adonis/Core/Event");
    const limit = Config.get("audit.bulkRowLimit", 50);

    const base = {
      table,
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
    };

    if (rows.length <= limit) {
      for (const row of rows) {
        const redact = [
          ...Config.get("audit.redactColumns", ["password"]),
          ...(options.redact ?? []),
        ];
        const before = redactRow(row.before, redact);
        const after = redactRow(row.after, redact);
        await Event.emit("adonis:audit:data", {
          ...base,
          event,
          data: after ?? before ?? {},
          before,
          after,
          changed: row.changed,
        } as any);
      }
      return;
    }

    await Event.emit("adonis:audit:data", {
      ...base,
      event: `bulk_${event}`,
      data: {
        payload,
        rowCount,
        ids: rows.map((row) => (row.before ?? row.after ?? {})[primaryKey]),
      },
    } as any);
  });
}

export async function auditedUpdate(
  container: IocContract,
  query: any,
  payload: Record<string, any>,
  options: AuditedBulkOptions = {}
): Promise<number> {
  const table = tableOf(query, options);
  const primaryKey = options.primaryKey ?? query?.model?.primaryKey ?? "id";
  const before = await selectRows(query);

  // Relecture des lignes écrites (RETURNING *, Postgres) pour journaliser les
  // valeurs réellement en base (colonnes calculées, updated_at...) ; sinon
  // fusion ligne + payload.
  const result =
    typeof query.returning === "function"
      ? await query.returning("*").update(payload)
      : await query.update(payload);
  const rowCount = normalizeCount(result, before.length);
  const returned: Record<string, any>[] =
    Array.isArray(result) && result.length > 0 && typeof result[0] === "object"
      ? result
      : [];
  const afterByKey = new Map(returned.map((row) => [row[primaryKey], row]));

  await emitBulk(
    container,
    query.client,
    "update",
    before.map((row) => {
      const after = afterByKey.get(row[primaryKey]) ?? { ...row, ...payload };
      return { before: row, after, changed: diffKeys(row, after) };
    }),
    rowCount,
    payload,
    options,
    table,
    primaryKey
  );
  return rowCount;
}

export async function auditedDelete(
  container: IocContract,
  query: any,
  options: AuditedBulkOptions = {}
): Promise<number> {
  const table = tableOf(query, options);
  const primaryKey = options.primaryKey ?? query?.model?.primaryKey ?? "id";
  const before = await selectRows(query);
  const result = await query.del();
  const rowCount = normalizeCount(result, before.length);
  await emitBulk(
    container,
    query.client,
    "delete",
    before.map((row) => ({ before: row })),
    rowCount,
    undefined,
    options,
    table,
    primaryKey
  );
  return rowCount;
}

/**
 * Insertion en masse. `client` est un `QueryClientContract` ou une transaction
 * (`Database`, `trx`). Les lignes créées sont relues via `RETURNING *`
 * (Postgres) pour journaliser leur état complet.
 */
export async function auditedInsert(
  container: IocContract,
  client: any,
  table: string,
  rows: Record<string, any>[],
  options: AuditedBulkOptions = {}
): Promise<Record<string, any>[]> {
  if (rows.length === 0) {
    return [];
  }
  const primaryKey = options.primaryKey ?? "id";
  const inserted: any[] = await client
    .insertQuery()
    .table(table)
    .returning("*")
    .insert(rows);
  const created = inserted.map((row, index) =>
    row && typeof row === "object" ? row : { ...rows[index], [primaryKey]: row }
  );
  await emitBulk(
    container,
    client,
    "create",
    created.map((row) => ({ after: row })),
    created.length,
    undefined,
    { ...options, table },
    table,
    primaryKey
  );
  return created;
}
