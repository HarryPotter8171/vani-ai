/**
 * Compatibility shim — canonical implementation lives in
 * `services/identity/IdentityGuard.js`.
 *
 * Prefer importing from `./identity/IdentityGuard.js` or `./identity/index.js`
 * in new code. This file keeps existing call sites working.
 */

export {
  VANI_SELF,
  VANI_SELF_FULL,
  VANI_DENY,
  VANI_HUMAN_DENY,
  VANI_CREATOR_REPLY,
  VANI_PROMPT_REFUSAL,
  VANI_IDENTITY_NAME,
  VANI_CREATOR,
  sanitizeIdentityResponse,
  sanitizeIdentityClaims,
  sanitizeIdentityStreamChunk,
  enforceIdentityOnText,
  forcedIdentityReply,
  isForeignIdentityQuestion,
  isWhoAreYouQuestion,
  isHumanQuestion,
  isCreatorQuestion,
  isIdentityCoercionAttack,
  isSystemPromptReveal,
  containsForbiddenIdentity,
  createIdentityStreamGuard,
  guardAgentEventStream,
  _FOREIGN_BRANDS,
} from "./identity/IdentityGuard.js";
