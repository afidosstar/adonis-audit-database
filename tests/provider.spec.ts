/*
 * @created 12/10/2022 - 12:32
 * @project adonis-audit-database
 * @author "fiacre.ayedoun@gmail.com"
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import test from "japa";
import { Ioc } from "@adonisjs/application";
import { Config } from "@adonisjs/config";
import { Logger } from "@adonisjs/logger";
import AuditDatabaseProvider from "../providers/AuditDatabaseProvider";
import { ApplicationContract } from "@ioc:Adonis/Core/Application";
import mongoose from "mongoose";

const ioc = new Ioc();
const provider = new AuditDatabaseProvider({
  container: ioc,
} as unknown as ApplicationContract);
const Model = ((ob: any) => {
  ob.$hooks = {
    add: function (event) {
      ob.isAddhook = true;
      ob.events.push(event);
    },
  };
  return ob;
})({ events: [] });
const Event = ((ob: any) => {
  ob.emit = function (event) {
    ob.isEmitEvent = true;
    ob.eventEmit = event;
  };
  ob.on = (event) => {
    ob.isListenEvent = true;
    ob.eventListen = event;
  };
  return ob;
})({});

test.group("AdonisJS Audit Db", (group) => {
  group.before((cb) => {
    ioc.singleton("Adonis/Core/Config", () => {
      let config = new Config();
      config.set("audit.connection", "mongodb://localhost/test");
      config.set("audit.collection", "audit_db");
      return config;
    });

    ioc.singleton("Adonis/Core/Logger", () => {
      return new Logger({ enabled: false, level: "debug", name: "test" });
    });
    ioc.singleton("Adonis/Core/Event", () => {
      return Event;
    });
    ioc.singleton("Adonis/Core/HttpContext", () => {
      return {
        request: {
          header: function (_key, _default) {
            return this.headers[_key] || _default;
          },
          headers: { Accept: "text/event-stream" },
        },
        response: {},
        params: {},
        getter(name, callback) {
          this[name] = callback.call(this);
        },
      };
    });

    provider.register();
    provider.boot().then(() => setTimeout(() => cb(), 5000));
  });
  group.after((cb) => {
    provider.shutdown().then(() => cb());
  });
  test("Audit provider instance registers instance(s) as expected", async (assert) => {
    assert.equal(ioc.use("Mongoose"), mongoose);
    console.log("provider.connected", provider.connected);
    assert.equal(provider.connected, true);
  });
  test("Audit provider instance registers instance(s) as expected", async (assert) => {
    const { AuditWatcher } = ioc.resolveBinding("Adonis/Addons/AuditDatabase");
    AuditWatcher({ guard: "jwt" } as any)(Model);
    assert.equal(Model.isAddhook, true);
    assert.equal(Event.isEmitEvent, true);
  });
});
