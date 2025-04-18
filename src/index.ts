/**
 * There is a store for each CID which contains a set of ids, these are called pinnersets.
 * And there is a store that maps names to ids called a dictionary.
 * Together they form a pinmap.
 */

import type { Datastore } from "interface-datastore";
import { Key } from "interface-datastore";
import type { CID } from "multiformats/cid";
import { MemoryDatastore } from "datastore-core";

export type Awaitable<T> = T | Promise<T>;

export interface OpenPinnerset {
  (cid: CID): Awaitable<Pinnerset>;
}

export interface Pinnerset {
  ds: Datastore;
  close?: () => Awaitable<void>;
}

export interface PinnerIds {
  /**
   * Only one way resolution is needed from original name to shortened id.
   */
  resolve(name: string): Awaitable<string>;
}

export interface Pinmap {
  pin(name: string, cid: CID): Awaitable<boolean>;
  unpin(name: string, cid: CID): Awaitable<boolean>;
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
    private readonly pinnersets: Map<string, Promise<Pinnerset>>
  ) {}

  async aquire(cid: CID): Promise<Pinnerset> {
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
      if (this.pinnersets.get(cidstring) === promise) {
        this.pinnersets.delete(cidstring);
        // wondering if could cause issues when an open is called concurrently. possible lock errors
        await pinnerset.close?.();
      } else {
        resolve(pinnerset);
      }
    };

    return { ds: pinnerset.ds, close };
  }
}

class DefaultPinmap implements Pinmap {
  #pinnersetManager: PinnersetHandler;

  constructor(
    private readonly pinnerIds: PinnerIds,
    openPinnerset: OpenPinnerset
  ) {
    this.#pinnersetManager = new PinnersetHandler(openPinnerset, new Map());
  }

  /**
   * Thinking about concurrency issues with pins and unpins.
   * What needs to be watched is concurrency per CID.
   * Pin must only return true if the pin was added and no previous pin existed for that CID.
   * Unpin must only return true if the last pin was removed and no new pins are being added for that CID.
   */

  async pin(name: string, cid: CID): Promise<boolean> {
    const id = await this.pinnerIds.resolve(name);
    const { ds, close } = await this.#pinnersetManager.aquire(cid);

    let empty = true;
    for await (const _ of ds.queryKeys({})) {
      empty = false;
      break;
    }

    await ds.put(new Key(id), bytes);

    await close?.();
    return empty;
  }

  async unpin(name: string, cid: CID): Promise<boolean> {
    const id = await this.pinnerIds.resolve(name);
    const { ds, close } = await this.#pinnersetManager.aquire(cid);

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

export function createDefaultPinners(): PinnerIds {
  const datastore = new MemoryDatastore();
  let i = 0;

  return {
    resolve: async (name: string): Promise<string> => {
      try {
        return new TextDecoder().decode(await datastore.get(new Key(name)));
      } catch {
        const id = String(i++);
        await datastore.put(new Key(name), new TextEncoder().encode(id));
        return id;
      }
    },
  };
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

export function createPinmap(pinners: PinnerIds, getPinnerset: OpenPinnerset): Pinmap {
  return new DefaultPinmap(pinners, getPinnerset);
}
