/*
 * @created 12/10/2022 - 12:30
 * @project adonis-audit-database
 * @author "fiacre.ayedoun@gmail.com"
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare module "@ioc:Adonis/Core/Event" {
  /*
    |--------------------------------------------------------------------------
    | Define typed events
    |--------------------------------------------------------------------------
    |
    | You can define types for events inside the following interface and
    | AdonisJS will make sure that all listeners and emit calls adheres
    | to the defined types.
    |
    | For example:
    |
    | interface EventsList {
    |   'new:user': UserModel
    | }
    |
    | Now calling `Event.emit('new:user')` will statically ensure that passed value is
    | an instance of the the UserModel only.
    |
    */
  import { AuditPayload } from "@ioc:Adonis/Addons/AuditDatabase";

  interface EventsList {
    "adonis:audit:data": AuditPayload;
  }
}
