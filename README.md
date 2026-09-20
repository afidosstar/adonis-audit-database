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
    connection: Env.get("AUDIT_CONNECTION","mongo://localhost"),
    collection: Env.get('AUDIT_COLLECTION',"audit_db"),
};

export default auditConfig;
```
# Sample Usage
## Model
On each model just add `@AuditWatcher()` on top like:

```ts
import {BaseModel, column} from '@ioc:Adonis/Lucid/Orm'
import {AuditWatcher} from "@ioc:Adonis/Addons/AuditDatabase";


@AuditWatcher()
export default class Package extends BaseModel {
    @column({isPrimary: true})
    public id: number

    @column()
    public label: number

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
      { origin: "command", service: this.constructor.name, userId: null, fullName: "cli" },
      () => this.handle()
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
import { auditedUpdate, auditedDelete, auditedInsert } from "@ioc:Adonis/Addons/AuditDatabase";

// same query you would have written, minus the terminal .update()/.del()
await auditedUpdate(
  Invoice.query({ client: trx }).where("transporter_id", id),
  { status: "cancelled" },
  { intent: "Annulation des factures du transporteur" }
);
await auditedDelete(trx.from("arrival_order_lines").where("arrival_order_id", id));
await auditedInsert(trx, "invoice_lines", rows);
```

Each affected row is journaled with its before/after state (rows are read
back with the same filter before writing; inserts use `RETURNING *`, so
Postgres is assumed). Above `bulkRowLimit` rows, a single
`bulk_update`/`bulk_delete`/`bulk_create` summary entry is written instead
(`rowCount`, `ids`, payload). Entries carry `bulk: true`.

## Config (`config/audit.ts`)

| Key | Default | Purpose |
|---|---|---|
| `connection` | — | Mongo connection string |
| `collection` | — | Mongo collection name |
| `metaLabelPath` | `routePermission.description` | Dot-path in `route.meta` to resolve the business label of the route (`intent`) |
| `deferToTransactionCommit` | `true` | Emit the audit entry only once the surrounding Lucid transaction commits |
| `auditAnonymous` | `false` | Emit an entry even when no user could be identified |
| `onError` | logs to console | Callback invoked when persisting the audit entry fails |
| `resolveUserId` | tries `id`/`userId`/`uuid` | `(user) => id` — the shape of your authenticated user belongs to your app, override this |
| `resolveUserDisplayName` | tries `full_name`/`fullName`/`fullname`/`name`/`username`/`email` | `(user) => displayName` — same idea, override this |
| `bulkRowLimit` | `50` | Above this many rows, bulk helpers write one summary entry instead of one per row |

The default fallbacks exist only so the package works out of the box on a
first install; any real project should set both explicitly since no two
`User` models look alike.

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?logo=typescript
[typescript-url]:  "typescript"

[npm-image]: https://img.shields.io/npm/v/%40fickou%2Fadonis-audit-database.svg?logo=npm
[npm-url]: https://www.npmjs.com/package/adonis-request-throttler "npm"

[license-image]: https://img.shields.io/npm/l/%40fickou%2Fadonis-audit-database?color=blueviolet
[license-url]: LICENSE.md "license"
[my-coffee-image]:https://img.shields.io/badge/-buy_me_a%C2%A0coffee-gray?logo=buy-me-a-coffee
[my-coffee-url]:https://www.buymeacoffee.com/afidosstar


