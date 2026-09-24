export type Session = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

/** How long a session stays valid before requiring a fresh sign-in. */
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
