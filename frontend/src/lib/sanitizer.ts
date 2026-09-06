/**
 * Recursive sanitizer to strip undefined and null values from objects
 * before sending to Cloud Firestore or API endpoints.
 * Conforms with Production Directives (Zero-Crash Payload Hygiene).
 */
export function sanitizeFirestorePayload<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as unknown as T;
  }

  if (typeof input === 'object' && input !== null) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeFirestorePayload(value);
      }
    }
    return cleaned as T;
  }

  return input;
}
