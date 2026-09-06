import { doc, setDoc, getDocs, collection, deleteDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { sanitizeFirestorePayload } from './sanitizer';
import type { JournalEntry, FlashbackResponse } from '../types/entry';

function getAuthHeader(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function saveJournalEntry(
  entry: JournalEntry,
  token: string | null,
  userId: string
): Promise<{ success: boolean; data?: JournalEntry; error?: string }> {
  // 1. Clean payload recursively
  const cleaned = sanitizeFirestorePayload({
    id: entry.id,
    title: entry.title.trim() || 'Untitled Reflection',
    content: entry.content,
    mood: entry.mood,
    tags: entry.tags,
    is_favorite: entry.isFavorite,
    word_count: entry.wordCount,
    char_count: entry.charCount,
    location: entry.location || null,
    dialogue_history: entry.dialogueHistory || [],
    synthesis: entry.synthesis || null,
    created_at: entry.createdAt,
    updated_at: new Date().toISOString(),
  });

  let savedEntry: JournalEntry | null = null;

  // 2. Auxiliary notify to FastAPI Backend Gateway (for AI context & memory indexing)
  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: getAuthHeader(token),
      body: JSON.stringify(cleaned),
    });

    if (res.ok) {
      const serverData = await res.json();
      savedEntry = {
        id: serverData.id,
        userId: serverData.user_id,
        title: serverData.title,
        content: serverData.content,
        mood: serverData.mood,
        tags: serverData.tags || [],
        isFavorite: serverData.is_favorite,
        wordCount: serverData.word_count,
        charCount: serverData.char_count,
        location: serverData.location || null,
        dialogueHistory: serverData.dialogue_history || [],
        synthesis: serverData.synthesis || null,
        createdAt: serverData.created_at,
        updatedAt: serverData.updated_at,
      };
    }
  } catch {
    // Auxiliary sync failure is non-blocking
  }

  // 3. Client-side Cloud Firestore authoritative write
  // Path: /users/{userId}/entries/{entryId}
  let firestoreSaved = false;
  try {
    if (!db) {
      return { success: false, error: 'Firestore database is not initialized.' };
    }
    const entryRef = doc(db, 'users', userId, 'entries', entry.id);
    await setDoc(entryRef, sanitizeFirestorePayload({
      id: entry.id,
      userId: userId,
      title: entry.title.trim() || 'Untitled Reflection',
      content: entry.content,
      mood: entry.mood,
      tags: entry.tags,
      isFavorite: entry.isFavorite,
      wordCount: entry.wordCount,
      charCount: entry.charCount,
      location: entry.location || null,
      dialogueHistory: entry.dialogueHistory || [],
      synthesis: entry.synthesis || null,
      createdAt: entry.createdAt,
      updatedAt: cleaned.updated_at,
    }), { merge: true });
    firestoreSaved = true;
  } catch (firestoreErr: any) {
    console.error('Cloud Firestore write failed:', firestoreErr);
    const msg = firestoreErr?.message || 'Firestore write failed';
    if (msg.includes('not-found') || msg.includes('does not exist')) {
      return {
        success: false,
        error: 'Firestore database has not been created yet in your Firebase Console. Please go to Firebase Console > Build > Firestore Database > Create database.'
      };
    }
    if (msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
      return {
        success: false,
        error: 'Firestore security rules denied permission. Ensure rules allow write to /users/{userId}/entries.'
      };
    }
    return { success: false, error: `Cloud Firestore error: ${msg}` };
  }

  const finalEntry: JournalEntry = savedEntry || {
    ...entry,
    userId: userId,
    updatedAt: cleaned.updated_at,
  };

  return { success: firestoreSaved, data: finalEntry };
}

export async function fetchUserEntries(
  token: string | null,
  userId: string
): Promise<JournalEntry[]> {
  if (!db || !userId) return [];

  // Query Cloud Firestore directly
  try {
    const entriesRef = collection(db, 'users', userId, 'entries');
    const q = query(entriesRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const item = d.data();
      return {
        id: d.id,
        userId: item.userId || userId,
        title: item.title || 'Untitled Reflection',
        content: item.content || '',
        mood: item.mood || 'Reflective',
        tags: item.tags || [],
        isFavorite: item.isFavorite || false,
        wordCount: item.wordCount || 0,
        charCount: item.charCount || 0,
        location: item.location || null,
        dialogueHistory: item.dialogueHistory || [],
        synthesis: item.synthesis || null,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      } as JournalEntry;
    });
  } catch (err: any) {
    console.error('Could not fetch Cloud Firestore entries:', err);
    // If client direct fetch fails, attempt backend gateway read
    try {
      const res = await fetch('/api/entries', {
        headers: getAuthHeader(token),
      });
      if (res.ok) {
        const data = await res.json();
        return data.map((item: any) => ({
          id: item.id,
          userId: item.user_id,
          title: item.title,
          content: item.content,
          mood: item.mood,
          tags: item.tags || [],
          isFavorite: item.is_favorite ?? false,
          wordCount: item.word_count || 0,
          charCount: item.char_count || 0,
          location: item.location || null,
          dialogueHistory: item.dialogue_history || [],
          synthesis: item.synthesis || null,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }));
      }
    } catch {
      // Backend gateway also unavailable
    }
  }

  return [];
}

export async function deleteJournalEntry(
  entryId: string,
  token: string | null,
  userId: string
): Promise<boolean> {
  let success = false;
  if (!db || !userId) return false;

  try {
    const entryRef = doc(db, 'users', userId, 'entries', entryId);
    await deleteDoc(entryRef);
    success = true;
  } catch (err) {
    console.error('Cloud Firestore delete error:', err);
  }

  try {
    await fetch(`/api/entries/${entryId}`, {
      method: 'DELETE',
      headers: getAuthHeader(token),
    });
  } catch {
    // Continue
  }

  return success;
}

export function subscribeToUserEntries(
  userId: string,
  token: string | null,
  onUpdate: (entries: JournalEntry[]) => void
): () => void {
  if (!db || !userId) {
    return () => {};
  }

  try {
    const entriesRef = collection(db, 'users', userId, 'entries');
    const q = query(entriesRef, orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: JournalEntry[] = snapshot.docs.map((d) => {
          const item = d.data();
          return {
            id: d.id,
            userId: item.userId || userId,
            title: item.title || 'Untitled Reflection',
            content: item.content || '',
            mood: item.mood || 'Reflective',
            tags: item.tags || [],
            isFavorite: item.isFavorite || false,
            wordCount: item.wordCount || 0,
            charCount: item.charCount || 0,
            location: item.location || null,
            dialogueHistory: item.dialogueHistory || [],
            synthesis: item.synthesis || null,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString(),
          } as JournalEntry;
        });
        onUpdate(items);
      },
      (err) => {
        console.error('Cloud Firestore real-time listener note:', err?.message);
        // Fall back to one-time query
        fetchUserEntries(token, userId).then((entries) => {
          if (entries.length > 0) onUpdate(entries);
        }).catch(() => {});
      }
    );
    return unsubscribe;
  } catch (err) {
    console.error('Failed to attach Cloud Firestore snapshot listener:', err);
    fetchUserEntries(token, userId).then((entries) => {
      if (entries.length > 0) onUpdate(entries);
    }).catch(() => {});
    return () => {};
  }
}

export async function fetchOnThisDayFlashbacks(
  token: string | null,
  targetDate?: string
): Promise<FlashbackResponse> {
  const url = targetDate 
    ? `/api/entries/on-this-day?target_date=${encodeURIComponent(targetDate)}`
    : '/api/entries/on-this-day';

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: getAuthHeader(token),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        targetDate: data.target_date,
        monthDay: data.month_day,
        flashbacks: (data.flashbacks || []).map((f: any) => {
          const item = f.entry || {};
          return {
            entry: {
              id: item.id,
              userId: item.user_id || item.userId,
              title: item.title || 'Untitled Reflection',
              content: item.content || '',
              mood: item.mood || 'Reflective',
              tags: item.tags || [],
              isFavorite: item.is_favorite ?? item.isFavorite ?? false,
              wordCount: item.word_count ?? item.wordCount ?? 0,
              charCount: item.char_count ?? item.charCount ?? 0,
              location: item.location || null,
              dialogueHistory: item.dialogue_history || item.dialogueHistory || [],
              synthesis: item.synthesis || null,
              createdAt: item.created_at || item.createdAt || new Date().toISOString(),
              updatedAt: item.updated_at || item.updatedAt || new Date().toISOString(),
            } as JournalEntry,
            yearsAgo: f.years_ago,
            formattedAnniversary: f.formatted_anniversary,
          };
        }),
        prompt: data.prompt || null,
      };
    }
  } catch (err) {
    console.warn('Error fetching on-this-day flashbacks from backend:', err);
  }

  // Graceful zero-state fallback
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return {
    targetDate: now.toISOString().split('T')[0],
    monthDay: `${mm}-${dd}`,
    flashbacks: [],
    prompt: null,
  };
}

