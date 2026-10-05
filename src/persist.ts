/**
 * Ask the browser not to evict our IndexedDB data when storage is tight. Safe to call on every start.
 * This is a request, not a guarantee (browsers decide), so exported backups are still the real safety net.
 * Lives in its own file so it never conflicts with db.ts. `storage` is injectable for testing.
 */
export async function requestPersistence(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage,
): Promise<boolean> {
  try {
    if (!storage?.persist) return false
    if (await storage.persisted?.()) return true // already granted: nothing to ask
    return await storage.persist()
  } catch {
    return false
  }
}
