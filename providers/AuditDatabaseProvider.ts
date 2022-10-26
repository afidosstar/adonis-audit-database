import type { ApplicationContract } from "@ioc:Adonis/Core/Application";
import mongoose, { Schema, connect } from "mongoose";
import useAuditWatcherDecorator from "../src/decorator/AuditWatcher";

export default class AuditDatabaseProvider {
  public static needsApplication: boolean = true;
  protected isConnected: boolean = false;
  public get connected(): boolean {
    return this.isConnected;
  }
  constructor(protected app: ApplicationContract) {}

  public register() {
    console.log(this.app.container.use("Adonis/Core/Config").get("audit"));
    const connection: string = this.app.container
      .use("Adonis/Core/Config")
      .get("audit.connection");

    // Connect the instance to DB
    try {
      if (connection) {
        connect(connection, (err) => {
          if (!err) {
            this.isConnected = true;
            return console.log("mongo database is connected successfully");
          }
          console.log("fail to connect mongo data Base");
        });
      }
    } catch (e) {
      console.log(e.message);
    }

    this.app.container.singleton("Adonis/Addons/AuditDatabase", () => {
      return { AuditWatcher: useAuditWatcherDecorator(this.app.container)};
    });

    // Attach it to IOC container as singleton
    this.app.container.singleton("Mongoose", () => mongoose);
  }

  public async boot() {
    const collection: string = this.app.container
      .use("Adonis/Core/Config")
      .get("audit.collection");
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
          meta: Object,
          fullName: String,
          userId: Number,
          table: String,
          createdAt: Date,
        })
      );

      Event.on("adonis:audit:data", async (data) => {
        try {
          const actionLog = new AuditLog({
            endpoint: `${data.request?.intended()} ${data.request?.url()}`,
            intent: (data.route?.meta as any)?.authorizeDescriptor.description,
            data: data.data,
            fullName: data.user?.full_name,
            userId: data.user?.id,
            table: data.table,
            createdAt: new Date(),
            type: data.event,
          });
          await actionLog.save();
        } catch (error) {
          console.log("error", error);
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
