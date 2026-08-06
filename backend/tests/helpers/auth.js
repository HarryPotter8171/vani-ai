import User from "../../models/User.js";
import { signAccessToken, signFileAccessToken } from "../../utils/jwt.js";

let counter = 0;

/** Create a Mongo user and a valid Bearer access token for it. */
export async function createAuthedUser(overrides = {}) {
  counter += 1;
  const email = overrides.email || `user${counter}@vani.test`;
  const name = overrides.name ?? `Test User ${counter}`;
  const user = await User.create({
    name,
    email,
    provider: "google",
    ...overrides,
  });
  const token = await signAccessToken({ email: user.email, name: user.name, sub: String(user._id) });
  // A distinct synthetic client IP per test user. Several routes rate-limit
  // by IP (see middleware/rateLimit.js); without this, many virtual users
  // created within one test file would share a single IP-keyed bucket and
  // spuriously trip 429s that have nothing to do with the behavior under test.
  const ip = `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
  return { user, token, authHeader: `Bearer ${token}`, ip };
}

export async function fileTokenFor(fileId, userId) {
  const token = await signFileAccessToken({ fileId: String(fileId), userId: String(userId) });
  return `Bearer ${token}`;
}
