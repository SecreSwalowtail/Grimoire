import { useIsFocused } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';

import { DeckOptionsSheet } from '@/components/decks/deck-options-sheet';
import { DeleteFolderDialog } from '@/components/decks/delete-folder-dialog';
import { FolderEditSheet } from '@/components/decks/folder-edit-sheet';
import { ImportSheet } from '@/components/decks/import-sheet';
import { MoveSheet } from '@/components/decks/move-sheet';
import { NewSheet, type NewKind } from '@/components/decks/new-sheet';
import { UndoToast } from '@/components/decks/parts';
import type { Undo } from '@/utils/deck-store';

type NewState = { kind: NewKind; folderId?: string | null; deckIds?: string[] }

// The Undo toast is shared by all Decks screens, so it survives navigation: deleting a folder
// from its own screen goes back to Decks, which then shows the toast.
type Toast = { message: string; undo: Undo }
let toast: Toast | null = null
const toastListeners = new Set<() => void>()
function setToast(next: Toast | null) {
  toast = next
  toastListeners.forEach((listener) => listener())
}
function useToast() {
  return useSyncExternalStore((listener) => {
    toastListeners.add(listener)
    return () => {
      toastListeners.delete(listener)
    }
  }, () => toast)
}

// The Decks sheets and Undo toast, shared by the Decks, Folder and Deck screens, and the
// hand-offs between them (Deck options → Move, Move → New folder, Edit folder → Delete…).
// Render `sheets` once at the end of the screen. `onUndoable`: takes the changes that can be undone
// instead of the Undo toast (the Decks screen's edit mode, which has its own Undo).
export function useDeckSheets({
  toastBottom = 16,
  onFolderDeleted,
  onDeckDeleted,
  onUndoable,
}: {
  toastBottom?: number
  onFolderDeleted?: () => void
  onDeckDeleted?: () => void
  onUndoable?: (message: string, undo: Undo) => void
} = {}) {
  const [newSheet, setNewSheet] = useState<NewState | null>(null)
  const [editFolderId, setEditFolderId] = useState<string | null>(null)
  const [optionsDeckId, setOptionsDeckId] = useState<string | null>(null)
  const [moveDeckIds, setMoveDeckIds] = useState<string[] | null>(null)
  const [importDeckId, setImportDeckId] = useState<string | null>(null)
  const [deleteFolderIds, setDeleteFolderIds] = useState<string[] | null>(null)
  const [onMoved, setOnMoved] = useState<(() => void) | undefined>(undefined)
  const shownToast = useToast()
  // Only the screen in front shows the toast; screens behind it in the stack stay mounted.
  const isFocused = useIsFocused()

  const showUndo = (message: string, undo: Undo) => (onUndoable ? onUndoable(message, undo) : setToast({ message, undo }))

  const sheets = (
    <>
      <NewSheet
        visible={newSheet != null}
        kind={newSheet?.kind ?? 'deck'}
        folderId={newSheet?.folderId}
        deckIds={newSheet?.deckIds}
        onClose={() => setNewSheet(null)}
      />
      <FolderEditSheet
        folderId={editFolderId}
        onClose={() => setEditFolderId(null)}
        onDelete={(folderId) => {
          setEditFolderId(null)
          setDeleteFolderIds([folderId])
        }}
      />
      <DeckOptionsSheet
        deckId={optionsDeckId}
        onClose={() => setOptionsDeckId(null)}
        onMove={(deckId) => {
          setOptionsDeckId(null)
          setMoveDeckIds([deckId])
        }}
        onImport={(deckId) => {
          setOptionsDeckId(null)
          setImportDeckId(deckId)
        }}
        onDeleted={(name, undo) => {
          showUndo(`${name} deleted`, undo)
          onDeckDeleted?.()
        }}
      />
      <ImportSheet deckId={importDeckId} onClose={() => setImportDeckId(null)} />
      <MoveSheet
        deckIds={moveDeckIds}
        onClose={() => setMoveDeckIds(null)}
        onMoved={onMoved}
        onNewFolder={(deckIds) => {
          setMoveDeckIds(null)
          setNewSheet({ kind: 'folder', deckIds })
        }}
      />
      <DeleteFolderDialog
        folderIds={deleteFolderIds}
        onClose={() => setDeleteFolderIds(null)}
        onDeleted={(message, undo) => {
          showUndo(message, undo)
          onFolderDeleted?.()
        }}
      />
      {shownToast && isFocused && (
        <UndoToast message={shownToast.message} onUndo={shownToast.undo} onHide={() => setToast(null)} bottom={toastBottom} />
      )}
    </>
  )

  return {
    sheets,
    openNew: (state: NewState) => setNewSheet(state),
    openFolderEdit: setEditFolderId,
    openDeckOptions: setOptionsDeckId,
    // `then` runs after a move, e.g. to clear a selection.
    openMove: (deckIds: string[], then?: () => void) => {
      setOnMoved(() => then)
      setMoveDeckIds(deckIds)
    },
    openDeleteFolders: setDeleteFolderIds,
    showUndo,
  }
}
