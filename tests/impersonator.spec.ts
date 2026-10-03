/*
 * @project adonis-audit-database
 *
 * Tests du champ d'impersonnalisation (impersonatorId / impersonatorName) :
 * propagation par le middleware et le contexte, rétrocompatibilité sans résolveur.
 */
import test from "japa";
import AuditContextMiddleware from "../src/middleware/AuditContextMiddleware";
import AuditExecutionContext from "../src/context/AuditExecutionContext";
import { resolveAuditActor } from "../src/hooks/bindAuditHooks";

const fakeCtx: any = {
  auth: { user: { id: 7, full_name: "Cible" } },
  route: { pattern: "/x", name: "x", meta: {} },
  request: {
    id: () => "req-1",
    intended: () => "GET",
    url: () => "/x",
  },
};

const fakeContainer = (config: Record<string, any> = {}): any => ({
  use: () => ({ get: (k: string, d?: any) => config[k] ?? d }),
  hasBinding: () => false,
});

test.group("Audit : impersonnalisation", () => {
  test("le middleware alimente le contexte avec l'administrateur réel", async (assert) => {
    const middleware = new AuditContextMiddleware({
      resolveImpersonatorId: () => 1,
      resolveImpersonatorName: () => "Admin",
    });
    let seen: any;
    await middleware.handle(fakeCtx, async () => {
      seen = AuditExecutionContext.get();
    });
    assert.equal(seen.userId, 7);
    assert.equal(seen.impersonatorId, 1);
    assert.equal(seen.impersonatorName, "Admin");
  });

  test("sans résolveur : champs null, comportement inchangé", async (assert) => {
    const middleware = new AuditContextMiddleware({});
    let seen: any;
    await middleware.handle(fakeCtx, async () => {
      seen = AuditExecutionContext.get();
    });
    assert.equal(seen.userId, 7);
    assert.isNull(seen.impersonatorId);
    assert.isNull(seen.impersonatorName);
  });

  test("un résolveur qui lève une erreur ne casse pas la requête", async (assert) => {
    const middleware = new AuditContextMiddleware({
      resolveImpersonatorId: () => {
        throw new Error("boom");
      },
    });
    let seen: any;
    await middleware.handle(fakeCtx, async () => {
      seen = AuditExecutionContext.get();
    });
    assert.isNull(seen.impersonatorId);
  });

  test("resolveAuditActor expose l'administrateur réel", async (assert) => {
    const actor = await AuditExecutionContext.run(
      {
        origin: "http",
        userId: 7,
        fullName: "Cible",
        impersonatorId: 1,
        impersonatorName: "Admin",
      },
      () => resolveAuditActor(fakeContainer(), "Svc")
    );
    assert.equal(actor?.userId, 7);
    assert.equal(actor?.impersonatorId, 1);
    assert.equal(actor?.impersonatorName, "Admin");
  });

  test("resolveAuditActor : null quand pas d'impersonnalisation", async (assert) => {
    const actor = await AuditExecutionContext.run(
      { origin: "http", userId: 7, fullName: "Cible" },
      () => resolveAuditActor(fakeContainer(), "Svc")
    );
    assert.isNull(actor?.impersonatorId);
    assert.isNull(actor?.impersonatorName);
  });
});
