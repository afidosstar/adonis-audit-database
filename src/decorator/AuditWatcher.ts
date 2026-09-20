import {
  AuditWatcherContract,
  AuditWatcherDecorator,
  AuditWatcherOptions,
} from "@ioc:Adonis/Addons/AuditDatabase";
import { IocContract } from "@adonisjs/fold";
import bindAuditHooks from "../hooks/bindAuditHooks";

export default function useAuditWatcherDecorator(
  container: IocContract
): AuditWatcherContract {
  return function (options?: AuditWatcherOptions): AuditWatcherDecorator {
    return function (Model) {
      bindAuditHooks(Model, container, {
        service: options?.service,
        events: options?.events,
      });
    };
  };
}
