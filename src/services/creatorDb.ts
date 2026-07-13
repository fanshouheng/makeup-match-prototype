import { openDB, type DBSchema } from "idb";
import type { CreatorProfile } from "../domain/creator";

interface MakeupMatchDatabase extends DBSchema {
  creators: {
    key: string;
    value: CreatorProfile;
    indexes: { "by-updatedAt": string };
  };
}

const databasePromise = openDB<MakeupMatchDatabase>("makeup-match-prototype", 1, {
  upgrade(database) {
    const store = database.createObjectStore("creators", { keyPath: "id" });
    store.createIndex("by-updatedAt", "updatedAt");
  },
});

export async function listCreators(): Promise<CreatorProfile[]> {
  const database = await databasePromise;
  return (await database.getAllFromIndex("creators", "by-updatedAt")).reverse();
}

export async function saveCreator(creator: CreatorProfile): Promise<void> {
  const database = await databasePromise;
  await database.put("creators", creator);
}

export async function deleteCreator(id: string): Promise<void> {
  const database = await databasePromise;
  await database.delete("creators", id);
}

export async function clearCreators(): Promise<void> {
  const database = await databasePromise;
  await database.clear("creators");
}

export async function replaceCreators(creators: CreatorProfile[]): Promise<void> {
  const database = await databasePromise;
  const transaction = database.transaction("creators", "readwrite");
  const clear = transaction.store.clear();
  const writes = creators.map((creator) => transaction.store.put(creator));
  await Promise.all([clear, ...writes, transaction.done]);
}
