/**
 * There is a store for each CID which contains a set of ids, these are called pinnersets.
 * And there is a store that maps names to ids called a dictionary.
 * Together they form a pinmap.
 */

import type { Datastore } from "interface-datastore";
import { Key } from "interface-datastore";
import type { CID } from "multiformats/cid";
import { MemoryDatastore } from "datastore-core";

export type Await<T> = T | Promise<T>;

export interface GetPinnerset {
  (cid: CID): Await<Pinnerset>;
}

export interface Pinnerset {
  ds: Datastore;
  close?: () => Promise<void>;
}

export interface PinnerIds {
  /**
   * Only one way resolution is needed from original name to shortened id.
   */
  resolve(name: string): Await<string>;
}

export interface Pinmap {
  pin(name: string, cid: CID): Await<void>;
  unpin(name: string, cid: CID): Await<boolean>;
}

const bytes = new Uint8Array();

class DefaultPinmap implements Pinmap {
  constructor(
    private readonly pinnerIds: PinnerIds,
    private readonly openPinnerset: GetPinnerset
  ) {}

  async pin(name: string, cid: CID) {
    const id = await this.pinnerIds.resolve(name);
    const { ds, close } = await this.openPinnerset(cid);

    await ds.put(new Key(id), bytes);

    await close?.();
  }

  async unpin(name: string, cid: CID): Promise<boolean> {
    const id = await this.pinnerIds.resolve(name);
    const { ds, close } = await this.openPinnerset(cid);

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

export function createDefaultGetPinnerset(): GetPinnerset {
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

export function createPinmap(pinners: PinnerIds, getPinnerset: GetPinnerset) {
  return new DefaultPinmap(pinners, getPinnerset);
}
