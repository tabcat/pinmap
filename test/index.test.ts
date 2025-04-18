import { expect } from "@std/expect";
import {
  createDefaultPinners,
  createPinmap,
  createDefaultGetPinnerset,
  type PinnerIds,
  type Pinnerset,
  type GetPinnerset,
  type Pinmap,
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
  let getPinnerset: GetPinnerset;
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

// todo: test concurrency of pins and unpins
Deno.test("createPinmap", async (t) => {
  let pinners: PinnerIds;
  let getPinnerset: GetPinnerset;
  let pinmap: Pinmap;
  const cid = await createCID();

  await t.step("should create a pinmap", () => {
    pinners = createDefaultPinners();
    getPinnerset = createDefaultGetPinnerset();
    pinmap = createPinmap(pinners, getPinnerset);
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
});
