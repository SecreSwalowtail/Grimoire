import type { SQLiteDatabase } from 'expo-sqlite';

import type { Deck, Folder } from '@/utils/deck-store';

// Rows as stored. utils/deck-store.ts turns them into Folder / Deck (and checks the values).
export type FolderRow = { id: string; name: string; color: string; sort: string; pinned: number };
export type DeckRow = { id: string; name: string; format: string; folder_id: string | null };

export type DeckSnapshot = { folders: Folder[]; decks: Deck[] };

export async function getDecksAndFolders(db: SQLiteDatabase) {
  const folders = await db.getAllAsync<FolderRow>(
    'SELECT id, name, color, sort, pinned FROM deck_folders ORDER BY position',
  );
  const decks = await db.getAllAsync<DeckRow>('SELECT id, name, format, folder_id FROM decks ORDER BY position');
  return { folders, decks };
}

// Rows of `after` that are new, changed or moved (with their new position), and ids that are gone.
// The store never edits objects in place, so an unchanged item is the very same object.
function diff<T extends { id: string }>(before: T[], after: T[]) {
  const old = new Map(before.map((item, position) => [item.id, { item, position }]));
  const upserts = after
    .map((item, position) => ({ item, position }))
    .filter(({ item, position }) => {
      const prev = old.get(item.id);
      return !prev || prev.item !== item || prev.position !== position;
    });
  const kept = new Set(after.map((item) => item.id));
  const deletes = before.filter((item) => !kept.has(item.id)).map((item) => item.id);
  return { upserts, deletes };
}

// Writes what changed between two snapshots of the deck store, in one transaction.
// Folders go in before the decks that point at them and come out after, so the folder_id
// foreign key always holds. Upserts (not INSERT OR REPLACE): a replace deletes the folder row
// first, which would clear folder_id on its decks.
export async function saveDeckChanges(db: SQLiteDatabase, before: DeckSnapshot, after: DeckSnapshot) {
  const folders = diff(before.folders, after.folders);
  const decks = diff(before.decks, after.decks);
  if (!folders.upserts.length && !folders.deletes.length && !decks.upserts.length && !decks.deletes.length) return;

  await db.withTransactionAsync(async () => {
    for (const { item: f, position } of folders.upserts) {
      await db.runAsync(
        `INSERT INTO deck_folders (id, name, color, sort, pinned, position) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color, sort = excluded.sort,
           pinned = excluded.pinned, position = excluded.position`,
        f.id,
        f.name,
        f.color,
        f.sort,
        f.pinned ? 1 : 0,
        position,
      );
    }
    for (const { item: d, position } of decks.upserts) {
      await db.runAsync(
        `INSERT INTO decks (id, name, format, folder_id, position) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, format = excluded.format,
           folder_id = excluded.folder_id, position = excluded.position`,
        d.id,
        d.name,
        d.format,
        d.folderId,
        position,
      );
    }
    for (const id of decks.deletes) await db.runAsync('DELETE FROM decks WHERE id = ?', id);
    for (const id of folders.deletes) await db.runAsync('DELETE FROM deck_folders WHERE id = ?', id);
  });
}
