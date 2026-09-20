import type { ApplicationContract } from "@ioc:Adonis/Core/Application";
import type { AuditPayload } from "@ioc:Adonis/Addons/AuditDatabase";
import mongoose, { Schema, connect } from "mongoose";
import useAuditWatcherDecorator from "../src/decorator/AuditWatcher";
import bindAuditHooks from "../src/hooks/bindAuditHooks";
import AuditExecutionContext from "../src/context/AuditExecutionContext";
import AuditContextMiddleware from "../src/middleware/AuditContextMiddleware";
import {
  auditedDelete,
  auditedInsert,
  auditedUpdate,
} from "../src/bulk/auditedQueries";

export default class AuditDatabaseProvider {
  public static needsApplication: boolean = true;
  protected isConnected: boolean = false;
  public get connected(): boolean {
    return this.isConnected;
  }
  constructor(protected app: ApplicationContract) {}

  public register() {
    const connection: string = this.app.container
      .use("Adonis/Core/Config")
      .get("audit.connection");

    // Connect the instance to DB
    if (connection) {
      connect(connection, (err) => {
        if (!err) {
          this.isConnected = true;
          return console.log("mongo database is connected successfully");
        }
        console.log("err", err);
        console.log("fail to connect mongo data Base to", connection);
      });
    }

    this.app.container.singleton("Adonis/Addons/AuditDatabase", () => {
      return {
        AuditWatcher: useAuditWatcherDecorator(this.app.container),
        registerAuditHooks: (Model: any, options: any = {}) =>
          bindAuditHooks(Model, this.app.container, options),
        AuditExecutionContext,
        auditedUpdate: (query: any, payload: any, options?: any) =>
          auditedUpdate(this.app.container, query, payload, options),
        auditedDelete: (query: any, options?: any) =>
          auditedDelete(this.app.container, query, options),
        auditedInsert: (
          client: any,
          table: string,
          rows: any[],
          options?: any
        ) => auditedInsert(this.app.container, client, table, rows, options),
      };
    });

    // Middleware global, à référencer par son nom de binding dans kernel.ts
    // (les imports `@ioc:` ne sont pas réécrits dans node_modules).
    this.app.container.singleton("Adonis/Addons/AuditDatabase/Context", () => {
      const config = this.app.container.use("Adonis/Core/Config");
      return new AuditContextMiddleware({
        resolveUserId: config.get("audit.resolveUserId"),
        resolveUserDisplayName: config.get("audit.resolveUserDisplayName"),
      });
    });

    // Attach it to IOC container as singleton
    this.app.container.singleton("Mongoose", () => mongoose);
  }

  public async boot() {
    const Config = this.app.container.use("Adonis/Core/Config");
    const collection: string = Config.get("audit.collection");
    // All bindings are ready, feel free to use them
    if (collection) {
      const Event = this.app.container.resolveBinding("Adonis/Core/Event");
      const AuditLog = mongoose.model(
        collection,
        new Schema({
          endpoint: String,
          type: String,
          intent: String,
          data: Object,
          before: Object,
          after: Object,
          changed: [String],
          meta: Object,
          fullName: String,
          userId: Schema.Types.Mixed,
          origin: String,
          service: String,
          requestId: String,
          bulk: Boolean,
          table: String,
          createdAt: Date,
        })
      );

      const onError: (error: unknown, payload: AuditPayload) => void =
        Config.get("audit.onError") ??
        ((error) =>
          console.log(
            "[adonis-audit-database] failed to persist audit entry",
            error
          ));

      Event.on("adonis:audit:data", async (data: AuditPayload) => {
        try {
          const actionLog = new AuditLog({
            endpoint:
              data.endpoint ??
              (data.request
                ? `${data.request.intended()} ${data.request.url()}`
                : undefined),
            intent: data.intent,
            data: data.data,
            before: data.before,
            after: data.after,
            changed: data.changed,
            fullName: data.fullName ?? data.user?.full_name,
            // `null` explicite (migration, commande) : Mongoose ignore undefined
            userId: data.userId ?? data.user?.id ?? null,
            origin: data.origin,
            service: data.service,
            requestId: data.requestId,
            bulk: data.bulk === true ? true : undefined,
            table: data.table,
            createdAt: new Date(),
            type: data.event,
          });
          await actionLog.save();
        } catch (error) {
          onError(error, data);
        }
      });
    }
  }

  public async shutdown() {
    // Cleanup, since app is going down
    // Going to take the Mongoose singleton from container
    // and call disconnect() on it
    // which tells Mongoose to gracefully disconnect from MongoBD server
    await this.app.container.use("Mongoose").disconnect();
  }
}
