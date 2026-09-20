import AuditDatabaseProvider from "./providers/AuditDatabaseProvider";
import AuditExecutionContext from "./src/context/AuditExecutionContext";

export default AuditDatabaseProvider;
// Utilisable hors IoC (aucune dépendance au container Adonis) : pratique
// dans les commandes ace, workers ou tâches qui n'ont pas de HttpContext.
export { AuditExecutionContext };
