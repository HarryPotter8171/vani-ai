/**
 * Identity package — VANI AI persona constants + post-generation Identity Guard.
 */

export {
  VANI_IDENTITY_NAME,
  VANI_CREATOR,
  VANI_IDENTITY_LOCK,
  VANI_IDENTITY_SYSTEM,
  VANI_IDENTITY_PREFIX,
} from "../identity.js";

export {
  VANI_SELF,
  VANI_SELF_FULL,
  VANI_DENY,
  VANI_HUMAN_DENY,
  VANI_CREATOR_REPLY,
  VANI_PROMPT_REFUSAL,
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
} from "./IdentityGuard.js";
