import { AuditConfig } from "@ioc:Adonis/Addons/AuditDatabase";

const auditConfig: AuditConfig = {
  connection: "mongo://localhost",
  collection: "audit_db",
};

export default auditConfig;
