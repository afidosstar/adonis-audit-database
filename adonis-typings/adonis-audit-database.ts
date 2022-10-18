/*
 * @created 12/10/2022 - 11:47
 * @project adonis-audit-database
 * @author "fiacre.ayedoun@gmail.com"
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare module "@ioc:Adonis/Addons/AuditDatabase" {
  import { RequestContract } from "@ioc:Adonis/Core/Request";
  import { RouteNode } from "@ioc:Adonis/Core/Route";
  import { GuardsList } from "@ioc:Adonis/Addons/Auth";
  import { LucidModel } from "@ioc:Adonis/Lucid/Orm";
  export interface AuditPayload {
    request?: RequestContract;
    route?: RouteNode;
    data: Record<string, any>;
    user?: Record<string, any>;
    table: string;
    event: string;
  }
  export interface AuditConfig {
    connection: string;
    collection: string;
  }
  export type AuditWatcherOptions = {
    guard: keyof GuardsList;
  };
  export type AuditWatcherDecorator = (constructor: LucidModel) => void;

  export interface AuditWatcherContract {
    (options: AuditWatcherOptions): AuditWatcherDecorator;
  }
  export const AuditWatcher: AuditWatcherContract;
}
