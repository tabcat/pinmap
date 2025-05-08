import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { describe, expect, it } from "vitest";
import {
  createDefaultGetPinnerset,
  createPinmap,
  type Pinnerset,
  PinnersetHandler,
} from "../src/index.js";

const createCID = async () =>
  CID.createV1(
    0x01,
    await sha256.digest(new TextEncoder().encode(Math.random().toString())),
  );

describe("PinnersetHandler", async () => {
  const pinnersets: Map<string, Promise<Pinnerset>> = new Map();
  const pinnersetHandler = new PinnersetHandler(
    createDefaultGetPinnerset(),
    pinnersets,
  );

  it("should aquire sequentially for same CID", async () => {
    const cid = await createCID();

    const pinnersetPromise = pinnersetHandler.acquire(cid);
    expect(Array.from(pinnersets.values()).length).toBe(1);

    const pinnerset2Promise = pinnersetHandler.acquire(cid);
    expect(Array.from(pinnersets.values()).length).toBe(1);

    const pinnerset = await pinnersetPromise;
    expect(pinnerset).toBeDefined();

    await pinnerset.close?.();

    const pinnerset2 = await pinnerset2Promise;
    expect(pinnerset2).toBeDefined();

    await pinnerset2.close?.();
    expect(Array.from(pinnersets.values()).length).toBe(0);
  });

  it("should aquire concurrently for different CIDs", async () => {
    const cid = await createCID();
    const cid2 = await createCID();

    const [pinnerset, pinnerset2] = await Promise.all([
      pinnersetHandler.acquire(cid),
      pinnersetHandler.acquire(cid2),
    ]);

    expect(pinnerset).toBeDefined();
    expect(pinnerset2).toBeDefined();
    expect(Array.from(pinnersets.values()).length).toBe(2);

    await Promise.all([pinnerset.close?.(), pinnerset2.close?.()]);

    expect(Array.from(pinnersets.values()).length).toBe(0);
  });
});

describe("createPinmap", async () => {
  const openPinnerset = createDefaultGetPinnerset();
  const pinmap = createPinmap(openPinnerset);
  const cid = await createCID();

  it("should pin an id to a cid", async () => {
    const pin = await pinmap.pin("test", cid);
    expect(pinmap).toBeDefined();
    expect(pin).toBe(true);
  });

  it("should pin a second id to a cid", async () => {
    const pin = await pinmap.pin("test2", cid);
    expect(pinmap).toBeDefined();
    expect(pin).toBe(false);
  });

  it("should unpin an id from a cid", async () => {
    const bool = await pinmap.unpin("test", cid);
    expect(pinmap).toBeDefined();
    expect(bool).toBe(false);
  });

  it("should unpin a second id from a cid", async () => {
    const bool = await pinmap.unpin("test2", cid);
    expect(pinmap).toBeDefined();
    expect(bool).toBe(true);
  });

  it("should handle concurrent pins and unpins for the same CID", async () => {
    const bool = pinmap.pin("test", cid);
    const bool2 = pinmap.pin("test2", cid);
    const bool3 = pinmap.unpin("test", cid);
    const bool4 = pinmap.unpin("test2", cid);
    expect(await bool).toBe(true);
    expect(await bool2).toBe(false);
    expect(await bool3).toBe(false);
    expect(await bool4).toBe(true);
  });
});
