import { DurableObject } from "cloudflare:workers";

const duration = 5 * 60 * 1000;

export class PrivateWindowTest extends DurableObject {
  async run(action, name) {
    const storage = this.ctx.storage;
    if (action === "match") {
      const active = await storage.get("test");
      return active?.expiresAt > Date.now() && typeof active.name === "string" ? active : null;
    }

    const test = { name, expiresAt: Date.now() + duration };
    // Schedule cleanup in the same storage batch as the name.
    await Promise.all([storage.setAlarm(test.expiresAt), storage.put("test", test)]);
    return test;
  }

  async forget(name, expiresAt) {
    const storage = this.ctx.storage;
    const active = await storage.get("test");
    if (active?.expiresAt > Date.now() && (active.name !== name || active.expiresAt !== expiresAt)) {
      return false;
    }
    await storage.deleteAll();
    return true;
  }

  async alarm() {
    const storage = this.ctx.storage;
    const test = await storage.get("test");
    if (!test || test.expiresAt <= Date.now()) await storage.deleteAll();
  }
}
