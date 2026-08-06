/**
 * Client-visible flag for optional development sign-in (Continue as developer).
 * Never enable in production builds. Does not auto-login after logout.
 */
export function isDevAuthClientEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ALLOW_DEV_AUTH === 'true'
  );
}
