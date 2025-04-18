import { expect } from "@std/expect";
import {
  createDefaultPinners,
  createPinmap,
  createDefaultGetPinnerset,
  type PinnerIds,
  type Pinnerset,
  type OpenPinnerset,
  type Pinmap,
  PinnersetHandler,
} from "../src/index.ts";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

const createCID = async () =>
  CID.createV1(
    0x01,
    await sha256.digest(new TextEncoder().encode(Math.random().toString()))
  );

Deno.test("createDefaultPinners", async (t) => {
  let pinners: PinnerIds;
  await t.step("should create a pinners", () => {
    pinners = createDefaultPinners();
    expect(pinners).toBeDefined();
  });

  await t.step("should resolve a new name to an id", async () => {
    const id = await pinners.resolve("test");
    expect(id).toBe(String(0));
  });

  await t.step("should resolve the same name to the same id", async () => {
    const id1 = await pinners.resolve("test");
    const id2 = await pinners.resolve("test");
    expect(id1).toBe(String(0));
    expect(id1).toBe(id2);
  });

  await t.step("should resolve a new name to a different id", async () => {
    const id1 = await pinners.resolve("test");
    const id2 = await pinners.resolve("test2");
    expect(id1).toBe(String(0));
    expect(id2).toBe(String(1));
  });
});

Deno.test("createDefaultGetPinnerset", async (t) => {
  let getPinnerset: OpenPinnerset;
  let pinnerset: Pinnerset;

  await t.step("should create a getPinnerset", () => {
    getPinnerset = createDefaultGetPinnerset();
    expect(getPinnerset).toBeDefined();
  });

  await t.step("should get a pinnerset", async () => {
    const cid = await createCID();
    pinnerset = await getPinnerset(cid);
    expect(pinnerset).toBeDefined();
  });
});

Deno.test("PinnersetHandler", async (t) => {
  let pinnersetHandler: PinnersetHandler;
  const pinnersets: Map<string, Promise<Pinnerset>> = new Map();

  await t.step("should create a pinnerset manager", () => {
    pinnersetHandler = new PinnersetHandler(createDefaultGetPinnerset(), pinnersets);
    expect(pinnersetHandler).toBeDefined();
  });

  await t.step("should aquire sequentially for same CID", async () => {
    const cid = await createCID();

    const pinnersetPromise = pinnersetHandler.aquire(cid);
    expect(Array.from(pinnersets.values()).length).toBe(1);

    const pinnerset2Promise = pinnersetHandler.aquire(cid);
    expect(Array.from(pinnersets.values()).length).toBe(1);

    const pinnerset = await pinnersetPromise;
    expect(pinnerset).toBeDefined();

    await pinnerset.close?.();

    const pinnerset2 = await pinnerset2Promise;
    expect(pinnerset2).toBeDefined();

    await pinnerset2.close?.();
    expect(Array.from(pinnersets.values()).length).toBe(0);
  });
  

  await t.step("should aquire concurrently for different CIDs", async () => {
    const cid = await createCID();
    const cid2 = await createCID();

    const [pinnerset, pinnerset2] = await Promise.all([
      pinnersetHandler.aquire(cid),
      pinnersetHandler.aquire(cid2),
    ]);

    expect(pinnerset).toBeDefined();
    expect(pinnerset2).toBeDefined();
    expect(Array.from(pinnersets.values()).length).toBe(2);

    await Promise.all([
      pinnerset.close?.(),
      pinnerset2.close?.(),
    ]);

    expect(Array.from(pinnersets.values()).length).toBe(0);
  });

});

// todo: test concurrency of pins and unpins
Deno.test("createPinmap", async (t) => {
  let pinners: PinnerIds;
  let openPinnerset: OpenPinnerset;
  let pinmap: Pinmap;
  const cid = await createCID();

  await t.step("should create a pinmap", () => {
    pinners = createDefaultPinners();
    openPinnerset = createDefaultGetPinnerset();
    pinmap = createPinmap(pinners, openPinnerset);
    expect(pinmap).toBeDefined();
  });

  await t.step("should pin a name to a cid", async () => {
    const pin = await pinmap.pin("test", cid);
    expect(pinmap).toBeDefined();
    expect(pin).toBe(true);
  });

  await t.step("should pin a second name to a cid", async () => {
    const pin = await pinmap.pin("test2", cid);
    expect(pinmap).toBeDefined();
    expect(pin).toBe(false);
  });

  await t.step("should unpin a name from a cid", async () => {
    const bool = await pinmap.unpin("test", cid);
    expect(pinmap).toBeDefined();
    expect(bool).toBe(false);
  });

  await t.step("should unpin a second name from a cid", async () => {
    const bool = await pinmap.unpin("test2", cid);
    expect(pinmap).toBeDefined();
    expect(bool).toBe(true);
  });

  await t.step("should handle concurrent pins and unpins for the same CID", async () => {
    const bool = pinmap.pin("test", cid);
    const bool2 = pinmap.pin("test2", cid);
    const bool3 = pinmap.unpin("test", cid);
    const bool4 = pinmap.unpin("test2", cid);
    expect(await bool).toBe(true);
    expect(await bool2).toBe(false);
    expect(await bool3).toBe(false);
    expect(await bool4).toBe(true);
  })
});
