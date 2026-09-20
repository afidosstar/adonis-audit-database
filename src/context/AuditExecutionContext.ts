/*
 * @project adonis-audit-database
 *
 * Contexte d'exécution générique propagé via AsyncLocalStorage, pour que
 * l'audit fonctionne aussi bien en requête HTTP que dans une commande ace,
 * un worker (NATS, queue...) ou une tâche planifiée. Le middleware fourni
 * par ce package alimente ce contexte pour les requêtes HTTP ; toute
 * application consommatrice peut appeler `run()` autour de ses propres
 * points d'entrée non-HTTP pour bénéficier du même audit.
 */
import { AsyncLocalStorage } from "async_hooks";

export interface AuditContextData {
  userId?: number | string | null;
  fullName?: string | null;
  origin: "http" | "command" | "task" | "nats" | "migration" | string;
  service?: string;
  route?: Record<string, any>;
  requestId?: string;
  /** Point d'entrée lisible, ex. "PUT /api/logistics/arrival-orders/12". */
  endpoint?: string;
}

const storage = new AsyncLocalStorage<AuditContextData>();

export default class AuditExecutionContext {
  public static run<T>(context: AuditContextData, callback: () => T): T {
    return storage.run(context, callback);
  }

  public static get(): AuditContextData | undefined {
    return storage.getStore();
  }

  /**
   * Complète le contexte courant (ex: le Service en cours ajoute son nom),
   * sans avoir à ré-ouvrir un `run()`. Ne fait rien hors contexte actif.
   */
  public static patch(partial: Partial<AuditContextData>): void {
    const current = storage.getStore();
    if (current) {
      Object.assign(current, partial);
    }
  }
}
