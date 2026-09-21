/*
 * @created 12/10/2022 - 11:47
 * @project adonis-audit-database
 * @author "fiacre.ayedoun@gmail.com"
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare module "@ioc:Adonis/Addons/AuditDatabase" {
  import { RequestContract } from "@ioc:Adonis/Core/Request";
  import { RouteNode } from "@ioc:Adonis/Core/Route";
  import { LucidModel } from "@ioc:Adonis/Lucid/Orm";

  export type AuditOrigin =
    | "http"
    | "command"
    | "task"
    | "nats"
    | "migration"
    | string;

  export interface AuditPayload {
    request?: RequestContract;
    route?: RouteNode | Record<string, any>;
    data: Record<string, any>;
    before?: Record<string, any>;
    after?: Record<string, any>;
    changed?: string[];
    user?: Record<string, any>;
    userId?: number | string | null;
    fullName?: string | null;
    origin?: AuditOrigin;
    service?: string;
    requestId?: string;
    table: string;
    event: string;
    /** Libellé métier de la route, résolu via `audit.metaLabelPath`. */
    intent?: string;
    /** "METHODE /url", fourni par le contexte ou dérivé de `request`. */
    endpoint?: string;
    /** Émis par les helpers d'écriture en masse (`auditedUpdate`...). */
    bulk?: boolean;
  }

  export interface AuditConfig {
    connection: string;
    collection: string;
    /**
     * Chemin (dot-path) dans `route.meta` où trouver le libellé métier de la
     * route, ex: "routePermission.description". Défaut :
     * "routePermission.description".
     */
    metaLabelPath?: string;
    /**
     * Retarde l'émission de l'audit jusqu'au commit de la transaction Lucid
     * en cours (évite les entrées d'audit fantômes en cas de rollback).
     * Défaut : true.
     */
    deferToTransactionCommit?: boolean;
    /**
     * Émet quand même une entrée d'audit quand aucun utilisateur n'a pu être
     * identifié (sinon l'événement est silencieusement ignoré, comportement
     * historique). Défaut : false.
     */
    auditAnonymous?: boolean;
    /** Rappel invoqué si l'écriture en base d'audit échoue. Défaut : console.log. */
    onError?: (error: unknown, payload: AuditPayload) => void;
    /**
     * Extrait l'identifiant depuis le user authentifié de l'application
     * consommatrice (la forme du User lui appartient, le package ne la
     * devine qu'en dernier recours : id, userId, uuid).
     */
    resolveUserId?: (user: any) => number | string | null | undefined;
    /**
     * Extrait le libellé affiché depuis le user authentifié (idem : forme
     * propre à l'application, deviné en dernier recours : full_name,
     * fullName, fullname, name, username, email).
     */
    resolveUserDisplayName?: (user: any) => string | null | undefined;
    /**
     * Au-delà de ce nombre de lignes, une écriture en masse est journalisée
     * en un seul résumé (`bulk_update`/`bulk_delete`/`bulk_create` avec
     * rowCount et ids) au lieu d'une entrée par ligne. Défaut : 50.
     */
    bulkRowLimit?: number;
    /**
     * Attribut du modèle porté par la suppression logique. Une mise à jour
     * qui ne change que cette colonne est journalisée "soft_delete" /
     * "restore", et le hook delete qui suit est ignoré (pas de doublon).
     * Défaut : "deletedAt".
     */
    softDeleteColumn?: string;
    /**
     * Colonnes/attributs masqués ("[masqué]") dans toutes les entrées
     * (hooks d'instance et helpers bulk). Défaut : ["password"].
     */
    redactColumns?: string[];
  }

  export type AuditWatcherOptions = {
    /** Nom de service à associer si le contexte d'exécution n'en fournit pas. */
    service?: string;
    /** Sous-ensemble d'événements à auditer (défaut : create, update, delete). */
    events?: Array<"create" | "update" | "delete">;
    /** Attributs masqués dans before/after/data, en plus de `audit.redactColumns`. */
    redact?: string[];
  };
  export type AuditWatcherDecorator = (constructor: LucidModel) => void;

  export interface AuditWatcherContract {
    (options?: AuditWatcherOptions): AuditWatcherDecorator;
  }
  export const AuditWatcher: AuditWatcherContract;

  /**
   * Alternative au décorateur : à appeler une fois par modèle (ou depuis un
   * mixin de base commun à tous les modèles du projet) pour activer l'audit
   * sans avoir à poser `@AuditWatcher()` partout.
   */
  export type RegisterAuditHooksContract = (
    constructor: LucidModel,
    options?: AuditWatcherOptions
  ) => void;
  export const registerAuditHooks: RegisterAuditHooksContract;

  export interface AuditContextData {
    userId?: number | string | null;
    fullName?: string | null;
    origin: AuditOrigin;
    service?: string;
    route?: Record<string, any>;
    requestId?: string;
    endpoint?: string;
  }

  export interface AuditExecutionContextContract {
    run<T>(context: AuditContextData, callback: () => T): T;
    get(): AuditContextData | undefined;
    patch(partial: Partial<AuditContextData>): void;
  }
  export const AuditExecutionContext: AuditExecutionContextContract;

  export interface AuditedBulkOptions {
    table?: string;
    service?: string;
    intent?: string;
    primaryKey?: string;
    /** Colonnes masquées ("[masqué]") dans before/after/data. */
    redact?: string[];
  }
  export interface AuditedPivotOptions {
    table?: string;
    service?: string;
    intent?: string;
  }
  /**
   * Relations many-to-many (`instance.related('roles')`) : exécutent
   * sync/attach/detach et journalisent une entrée `pivot_<action>` sur la
   * table pivot avec les identifiants avant/après, ajoutés/retirés.
   */
  export const auditedSync: (
    related: any,
    ids: any,
    options?: AuditedPivotOptions
  ) => Promise<void>;
  export const auditedAttach: (
    related: any,
    ids: any,
    options?: AuditedPivotOptions
  ) => Promise<void>;
  export const auditedDetach: (
    related: any,
    ids?: any,
    options?: AuditedPivotOptions
  ) => Promise<void>;
  /**
   * Écritures en masse auditées (hors hooks d'instance) : le query builder
   * doit déjà être filtré et porter sa transaction. Renvoient le nombre de
   * lignes touchées (ou les lignes créées pour l'insertion).
   */
  export const auditedUpdate: (
    query: any,
    payload: Record<string, any>,
    options?: AuditedBulkOptions
  ) => Promise<number>;
  export const auditedDelete: (
    query: any,
    options?: AuditedBulkOptions
  ) => Promise<number>;
  export const auditedInsert: (
    client: any,
    table: string,
    rows: Record<string, any>[],
    options?: AuditedBulkOptions
  ) => Promise<Record<string, any>[]>;
}
