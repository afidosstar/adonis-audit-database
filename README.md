# adonis-audit-database
> Add helper on Controller for Adonis JS 5+

[![typescript-image]][typescript-url] 
[![npm-image]][npm-url] 
[![license-image]][license-url]

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
import {AuditWatcher} from "@fickou/adonis-audit-database";


@AuditWatcher()
export default class Package extends BaseModel {
    @column({isPrimary: true})
    public id: number

    @column()
    public label: number

}
```

[typescript-image]: https://img.shields.io/badge/Typescript-294E80.svg?style=for-the-badge&logo=typescript
[typescript-url]:  "typescript"

[npm-image]: https://img.shields.io/npm/v/%40fickou%2Fadonis-audit-database.svg?style=for-the-badge&logo=npm
[npm-url]: https://www.npmjs.com/package/adonis-request-throttler "npm"

[license-image]: https://img.shields.io/npm/l/%40fickou%2Fadonis-audit-database?color=blueviolet&style=for-the-badge
[license-url]: LICENSE.md "license"

