import { AuditConfig } from "@ioc:Adonis/Addons/AuditDatabase";
import Env from "@ioc:Adonis/Core/Env";

const auditConfig: AuditConfig = {
  connection: Env.get("AUDIT_CONNECTION","mongo://localhost"),
  collection: Env.get('AUDIT_COLLECTION',"audit_db"),
};

export default auditConfig;
