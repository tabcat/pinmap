/**
 * A pinmap is a map of CIDs to a set of pinner ids.
 */

import { MemoryDatastore } from "datastore-core";
import type { Datastore } from "interface-datastore";
import { Key } from "interface-datastore";
import type { CID } from "multiformats/cid";

export type Awaitable<T> = T | Promise<T>;

export interface OpenPinnerset {
  (cid: CID): Awaitable<Pinnerset>;
}

export interface Pinnerset {
  ds: Datastore;
  close?: () => Awaitable<void>;
}

export interface Pinmap {
  pin(id: string, cid: CID): Awaitable<boolean>;
  unpin(id: string, cid: CID): Awaitable<boolean>;
}

const bytes = new Uint8Array();

const createDeferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

/**
 * Handles concurrency of pinnersets per CID.
 */
export class PinnersetHandler {
  constructor(
    private readonly openPinnerset: OpenPinnerset,
    private readonly pinnersets: Map<string, Promise<Pinnerset>>,
  ) {}

  async acquire(cid: CID): Promise<Pinnerset> {
    const cidstring = String(cid);

    let pinnersetPromise = this.pinnersets.get(cidstring);

    const { promise, resolve } = createDeferred<Pinnerset>();
    this.pinnersets.set(cidstring, promise);

    if (pinnersetPromise == null) {
      pinnersetPromise = Promise.resolve(this.openPinnerset(cid));
    }

    const pinnerset = await pinnersetPromise;

    const close = async () => {
      // If the promise was not overwritten, we are the last one and can close the pinnerset.
      if (this.pinnersets.get(cidstring) === promise) await pinnerset.close?.();
      // check again to make sure we are the last one.
      if (this.pinnersets.get(cidstring) === promise)
        this.pinnersets.delete(cidstring);

      resolve(pinnerset);
    };

    return { ds: pinnerset.ds, close };
  }
}

class DefaultPinmap implements Pinmap {
  #pinnersetManager: PinnersetHandler;

  constructor(openPinnerset: OpenPinnerset) {
    this.#pinnersetManager = new PinnersetHandler(openPinnerset, new Map());
  }

  /**
   * Thinking about concurrency issues with pins and unpins.
   * What needs to be watched is concurrency per CID.
   * Pin must only return true if the pin was added and no previous pin existed for that CID.
   * Unpin must only return true if the last pin was removed and no new pins are being added for that CID.
   */

  async pin(id: string, cid: CID): Promise<boolean> {
    const { ds, close } = await this.#pinnersetManager.acquire(cid);

    let empty = true;
    for await (const _ of ds.queryKeys({})) {
      empty = false;
      break;
    }

    await ds.put(new Key(id), bytes);

    await close?.();
    return empty;
  }

  async unpin(id: string, cid: CID): Promise<boolean> {
    const { ds, close } = await this.#pinnersetManager.acquire(cid);

    await ds.delete(new Key(id));

    let empty = true;
    for await (const _ of ds.queryKeys({})) {
      empty = false;
      break;
    }

    await close?.();
    return empty;
  }
}

export function createDefaultGetPinnerset(): OpenPinnerset {
  const pinnersetDatastores = new Map<string, Datastore>();

  return (cid: CID) => {
    let ds = pinnersetDatastores.get(String(cid));

    if (ds == null) {
      ds = new MemoryDatastore();
      pinnersetDatastores.set(String(cid), ds);
    }

    return { ds };
  };
}

export function createPinmap(getPinnerset: OpenPinnerset): Pinmap {
  return new DefaultPinmap(getPinnerset);
}
