// Delete account, part two: the person's Supabase Auth user (Authentication > Users) goes too.
// Accounts are added there when they're made (server.js addAuthUser, or Supabase's own email-code sign-in), so a
// deleted account would otherwise leave its email behind. With SUPABASE_URL and SUPABASE_SECRET_KEY set this calls
// the Auth admin API: DELETE /auth/v1/admin/users/{id}. The Auth user id is the one stored on the account
// (user.authId) or, for older accounts, looked up by email. Without Supabase it does nothing.
// Never throws: the account row is already gone, so a failure here is logged and reported, not shown as an error.

function configured(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
}
function headers(key) {
  return { apikey: key, "content-type": "application/json", ...(String(key).startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) };
}

// Find the Auth user for this account: stored id, else by email (pages of 1000), else by sidequest_id in metadata
async function findId(user, { env, fetchImpl }) {
  if (user.authId) return user.authId;
  const email = String(user.email || "").trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const res = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, { headers: headers(env.SUPABASE_SECRET_KEY) });
    if (!res.ok) throw new Error(`Supabase Auth ${res.status} listing users`);
    const body = await res.json();
    const users = Array.isArray(body) ? body : body.users || [];
    const hit = users.find((a) => (email && String(a.email || "").toLowerCase() === email) || (a.user_metadata && a.user_metadata.sidequest_id === user.id));
    if (hit) return hit.id;
    if (users.length < 1000) return null;
  }
  return null;
}

// -> { skipped: "not configured" } | { deleted: id } | { skipped: "no auth user" } | { error }
async function deleteAuthUser(user, { env = process.env, fetchImpl = global.fetch, log = console } = {}) {
  if (!configured(env)) return { skipped: "not configured" };
  try {
    const id = await findId(user, { env, fetchImpl });
    if (!id) return { skipped: "no auth user" };
    const res = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(env.SUPABASE_SECRET_KEY) });
    if (res.status === 404) return { skipped: "no auth user" };
    if (!res.ok) throw new Error(`Supabase Auth ${res.status}: ${await res.text().catch(() => "")}`);
    return { deleted: id };
  } catch (err) {
    log.error("Supabase Auth user not deleted:", err.message);
    return { error: err.message };
  }
}

module.exports = { configured, deleteAuthUser };
