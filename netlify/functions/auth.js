
  const u = await fbGet('users/' + userId);
  const token = makeToken();
  await fbPost('sessions', { user_id: userId, token, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() });

  // Notify owners (fire and forget — don't block signup)
  notifyOwners(name, email).catch(e => console.error('Notification error:', e));

  return r(200, { token, user: { id: userId, name: u.name, email: u.email, role: u.role, tier: u.tier || 'core' } });
}

// ── Owner Notifications (private — emails never exposed to frontend) ──
const OWNER_EMAILS = [
  'kyle@shotbreak.io',
  'scott@shotbreak.io',
  'steve@shotbreak.io',
  // Current active shorts for the 3 owners (kyleF/steveC/scottD/steveK)
  'kylef@shotbreak.io',
  'stevec@shotbreak.io',
  'scottd@shotbreak.io',
  'stevek@shotbreak.io'
];

async function notifyOwners(name, email) {
  // 1. Always log to Firebase
  await fbPost('signup_notifications', {
    name, email,
    timestamp: new Date().toISOString(),
    read: false
  });
