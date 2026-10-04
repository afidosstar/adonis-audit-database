# adonis-audit-database

> Add helper on Controller for Adonis JS 5+

[![typescript-image]][typescript-url]
[![npm-image]][npm-url]
[![license-image]][license-url]
[![my-coffee-image]][my-coffee-url]

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

## Table of contents

- [Installation](#installation)
- [Sample Usage](#sample-usage)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Installation

Run:

```bash
npm i --save @fickou/adonis-audit-database
```

Install provider:

```bash
node ace configure @fickou/adonis-audit-database
```

# Configuration

Go to `config/audit.ts` and defined you own configuration:

```ts
import { AuditConfig } from "@ioc:Adonis/Addons/AuditDatabase";
import Env from "@ioc:Adonis/Core/Env";

const auditConfig: AuditConfig = {
  connection: Env.get("AUDIT_CONNECTION", "mongo://localhost"),
  collection: Env.get("AUDIT_COLLECTION", "audit_db"),
};

export default auditConfig;
```

# Sample Usage

## Model

On each model just add `@AuditWatcher()` on top like:

```ts
import { BaseModel, column } from "@ioc:Adonis/Lucid/Orm";
import { AuditWatcher } from "@ioc:Adonis/Addons/AuditDatabase";

@AuditWatcher()
export default class Package extends BaseModel {
  @column({ isPrimary: true })
  public id: number;

  @column()
  public label: number;
}
```

Options: `@AuditWatcher({ service: "CustomLabel", events: ["create", "update"] })`.

`AuditWatcher` and `registerAuditHooks` must come from the `@ioc:Adonis/Addons/AuditDatabase`
alias (not a plain npm import) — that's what binds them to the running
application's IoC container (Config, Event, HttpContext).

## Covering every model without repeating the decorator

Instead of the per-model decorator, call `registerAuditHooks` once from a
shared base model mixin so every model that extends it is audited
automatically:

```ts
import { registerAuditHooks } from "@ioc:Adonis/Addons/AuditDatabase";
import { BaseModel } from "@ioc:Adonis/Lucid/Orm";

export default class ExBaseModel extends BaseModel {
  public static boot() {
    if (this.booted) return;
    super.boot();
    registerAuditHooks(this);
  }
}
```

## HTTP requests: who did what, from which service

Register the provided middleware (exposed by the provider as the IoC binding
`Adonis/Addons/AuditDatabase/Context`) **after** your auth middleware (e.g.
`SilentAuth`) in `start/kernel.ts`:

```ts
Server.middleware.register([
  () => import("@ioc:Adonis/Core/BodyParser"),
  () => import("App/Middleware/SilentAuth"),
  "Adonis/Addons/AuditDatabase/Context",
]);
```

This makes the audit entry carry the authenticated user, the route and a
request id, without each hook having to re-authenticate.

## Non-HTTP writes (ace commands, workers, scheduled tasks)

The Lucid hooks alone can't see who triggered a write outside of an HTTP
request. Wrap the entry point with `AuditExecutionContext.run(...)` so the
same audit hooks pick it up:

```ts
import { AuditExecutionContext } from "@fickou/adonis-audit-database";

export default class SyncTransportersCommand extends BaseCommand {
  public async run() {
    await AuditExecutionContext.run(
      {
        origin: "command",
        service: this.constructor.name,
        userId: null,
        fullName: "cli",
      },
      () => this.handle(),
    );
  }
}
```

Use `origin: "nats"` in a message listener, `origin: "task"` in a scheduled
task, etc. Every field is free-form on purpose so it fits any project.

An explicit non-HTTP context is always audited, even with `userId: null`
(that is the whole point of declaring it); `auditAnonymous` only governs
HTTP requests without an authenticated user.

## Bulk writes (`query().update()`, `Database.from().update()`, `insert`, `del`)

Lucid hooks only fire on model instances. Query-builder writes bypass them,
so run them through the audited helpers instead (from the IoC alias):

```ts
import {
  auditedUpdate,
  auditedDelete,
  auditedInsert,
} from "@ioc:Adonis/Addons/AuditDatabase";

// same query you would have written, minus the terminal .update()/.del()
await auditedUpdate(
  Invoice.query({ client: trx }).where("transporter_id", id),
  { status: "cancelled" },
  { intent: "Annulation des factures du transporteur" },
);
await auditedDelete(
  trx.from("arrival_order_lines").where("arrival_order_id", id),
);
await auditedInsert(trx, "invoice_lines", rows);
```

Each affected row is journaled with its before/after state (rows are read
back with the same filter before writing; inserts use `RETURNING *`, so
Postgres is assumed). Above `bulkRowLimit` rows, a single
`bulk_update`/`bulk_delete`/`bulk_create` summary entry is written instead
(`rowCount`, `ids`, payload). Entries carry `bulk: true`. Pass
`redact: ["token", "password"]` to mask sensitive columns.

## Many-to-many relations (`related().sync()/attach()/detach()`)

Pivot writes fire no Lucid hook either. Wrap them:

```ts
import {
  auditedSync,
  auditedAttach,
  auditedDetach,
} from "@ioc:Adonis/Addons/AuditDatabase";

await auditedSync(user.related("roles"), roleIds, {
  intent: "Rôles de l'utilisateur",
});
await auditedDetach(role.related("permissions")); // detach all
```

One `pivot_sync|pivot_attach|pivot_detach` entry is written on the pivot
table with `before`/`after` = related ids and `data.added`/`data.removed`.

## Soft deletes

With `adonis-lucid-soft-deletes`, `instance.delete()` saves `deletedAt` then
runs the delete hooks. The package journals a single `soft_delete` entry
(`restore` when the column goes back to null) and skips the redundant delete
hook. Set `softDeleteColumn` if your attribute is not `deletedAt`.

## Mongoose connection (`strictQuery` and other global options)

The provider opens the Mongo connection itself, in its **`register()`**, with
the global `mongoose` instance, then exposes that instance as the IoC binding
`Mongoose` (reuse it instead of opening a second connection):

```ts
import Mongoose from "@ioc:Mongoose";

await Mongoose.connection.collection("my_collection").find().toArray();
```

### `strictQuery`

Mongoose 6 warns at `connect()` when `strictQuery` is unset:

```
[MONGOOSE] DeprecationWarning: Mongoose: the `strictQuery` option will be
switched back to `false` by default in Mongoose 7.
```

Since 1.0.23 the provider sets `strictQuery: true` (the Mongoose 6 default,
made explicit) right before connecting, **only if your app has not set it
already**. Nothing to do for the warning to go away.

`strictQuery` governs query **filters** on fields missing from a model's
schema: `true` drops them silently (`Model.deleteMany({ typo: x })` becomes
`deleteMany({})`), `false` keeps them (Mongoose 7 default), `"throw"` raises a
`StrictModeError`. It only applies to Mongoose models, not to native
collections (`Mongoose.connection.collection(name)`).

To pick another value, set it from one of your own providers, listed
**before** the package in `.adonisrc.json`, so it runs before the package's
`register()`:

```ts
// providers/MongooseProvider.ts
import Mongoose from "mongoose";

export default class MongooseProvider {
  // Keep it synchronous: AdonisJS does not await register(), an
  // `await import("mongoose")` would run after the package's connect().
  public register() {
    Mongoose.set("strictQuery", "throw");
  }
}
```

```json
"providers": [
  "./providers/MongooseProvider",
  "@fickou/adonis-audit-database"
]
```

The same applies to any other global option Mongoose reads at `connect()`.

Pitfalls:

- Use a static `import Mongoose from "mongoose"`, not `@ioc:Mongoose`: the
  binding does not exist yet when your `register()` runs. A `boot()` or
  `ready()` hook is too late as well (every `register()` runs first).
- Your app and the package must share **one** copy of `mongoose`
  (`npm ls mongoose` must show it `deduped`). With a nested copy under
  `node_modules/@fickou/adonis-audit-database/node_modules/`, your
  `Mongoose.set()` targets another instance and has no effect.

## Custom persistence (your own collection layout)

The built-in persistence writes every entry into the single collection
`audit.collection`, fixed at boot. To store entries differently (one
collection per year, another database, a queue…), leave `collection`
**undefined**: the package then registers no listener of its own, while the
hooks and helpers keep emitting the `adonis:audit:data` event. Listen to it
from your provider's `boot()`:

```ts
public async boot() {
  const Event = this.app.container.resolveBinding("Adonis/Core/Event");
  const Config = this.app.container.resolveBinding("Adonis/Core/Config");
  const Mongoose = this.app.container.resolveBinding("Mongoose");

  Event.on("adonis:audit:data", async (data) => {
    try {
      const year = new Date().getFullYear();
      await Mongoose.connection.collection(`audit_${year}`).insertOne({
        type: data.event,
        table: data.table,
        intent: data.intent,
        userId: data.userId ?? null,
        fullName: data.fullName,
        before: data.before,
        after: data.after,
        changed: data.changed,
        data: data.data,
        origin: data.origin,
        service: data.service,
        requestId: data.requestId,
        createdAt: new Date(),
      });
    } catch (error) {
      // Same contract as the built-in persistence: never break the write
      Config.get("audit.onError")?.(error, data);
    }
  });
}
```

What your listener takes over from the built-in persistence:

- **Error handling**: catch everything and route it to `audit.onError`; an
  exception left in the listener does not reach the business write, but is lost.
- **Serialization**: with the native driver, luxon `DateTime` values in
  `before`/`after` are stored as their internal fields: convert them
  (`toISO()` / `toJSDate()`). JSON columns whose keys contain `.` or start
  with `$` must be escaped too.
- **Indexes**: create them yourself (e.g. `createdAt`, `{ table, "data.id" }`,
  `userId`, `type`), idempotently, on the first write to each collection.
- **`endpoint`**: the built-in persistence rebuilds it from `data.request`
  when absent; do the same if you need it.

## Config (`config/audit.ts`)

| Key                                                 | Default                                                           | Purpose                                                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection`                                        | —                                                                 | Mongo connection string, opened in the provider's `register()` (see [Mongoose connection](#mongoose-connection-strictquery-and-other-global-options))                |
| `collection`                                        | —                                                                 | Collection of the built-in persistence; leave undefined to persist entries yourself (see [Custom persistence](#custom-persistence-your-own-collection-layout))       |
| `metaLabelPath`                                     | `routePermission.description`                                     | Dot-path in `route.meta` to resolve the business label of the route (`intent`)                                                                                       |
| `deferToTransactionCommit`                          | `true`                                                            | Emit the audit entry only once the surrounding Lucid transaction commits                                                                                             |
| `auditAnonymous`                                    | `false`                                                           | Emit an entry even when no user could be identified                                                                                                                  |
| `onError`                                           | logs to console                                                   | Callback invoked when persisting the audit entry fails                                                                                                               |
| `resolveUserId`                                     | tries `id`/`userId`/`uuid`                                        | `(user) => id` — the shape of your authenticated user belongs to your app, override this                                                                             |
| `resolveUserDisplayName`                            | tries `full_name`/`fullName`/`fullname`/`name`/`username`/`email` | `(user) => displayName` — same idea, override this                                                                                                                   |
| `resolveImpersonatorId` / `resolveImpersonatorName` | none                                                              | optional `(ctx) => id` / `(ctx) => name` — real admin when the request impersonates a user; stored as `impersonatorId` / `impersonatorName` (absent otherwise)       |
| `bulkRowLimit`                                      | `50`                                                              | Above this many rows, bulk helpers write one summary entry instead of one per row                                                                                    |
| `softDeleteColumn`                                  | `deletedAt`                                                       | Model attribute used by soft deletes (`soft_delete`/`restore` labels, no duplicate entry)                                                                            |
| `redactColumns`                                     | `["password"]`                                                    | Attributes masked as `[masqué]` in every entry (`before`/`after`/`data`); per-model `@AuditWatcher({ redact })` / `registerAuditHooks(Model, { redact })` adds to it |

The default fallbacks exist only so the package works out of the box on a
first install; any real project should set both explicitly since no two
`User` models look alike.

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?logo=typescript
[typescript-url]: "typescript"
[npm-image]: https://img.shields.io/npm/v/%40fickou%2Fadonis-audit-database.svg?logo=npm
[npm-url]: https://www.npmjs.com/package/adonis-request-throttler "npm"
[license-image]: https://img.shields.io/npm/l/%40fickou%2Fadonis-audit-database?color=blueviolet
[license-url]: LICENSE.md "license"
[my-coffee-image]: https://img.shields.io/badge/-buy_me_a%C2%A0coffee-gray?logo=buy-me-a-coffee
[my-coffee-url]: https://www.buymeacoffee.com/afidosstar
