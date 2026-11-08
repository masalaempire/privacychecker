import { DurableObject } from "cloudflare:workers";

const duration = 5 * 60 * 1000;

export class PrivateWindowTest extends DurableObject {
  async run(action) {
    const storage = this.ctx.storage;
    const active = await storage.get("test");
    const now = Date.now();
    if (active?.expiresAt > now) return active;
    if (action !== "start") return null;

    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)),
      (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    const test = { code: code.slice(0, 6) + "-" + code.slice(6), expiresAt: now + duration };
    // Schedule cleanup in the same storage batch as the receipt.
    await Promise.all([storage.setAlarm(test.expiresAt), storage.put("test", test)]);
    return test;
  }

  async alarm() {
    const storage = this.ctx.storage;
    const test = await storage.get("test");
    if (!test || test.expiresAt <= Date.now()) await storage.deleteAll();
  }
}
