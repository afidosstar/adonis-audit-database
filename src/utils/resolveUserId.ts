import getByPath from "./getByPath";

export type UserIdResolver = (user: any) => number | string | null | undefined;

// Chemins essayés uniquement quand le projet consommateur n'a pas fourni son
// propre résolveur via `audit.resolveUserId` — la clé d'identité (id, uuid,
// matricule...) est propre à chaque application, ne pas la deviner en dur.
const FALLBACK_CANDIDATE_PATHS = ["id", "userId", "uuid"];

export default function resolveUserId(
  user: any,
  resolver?: UserIdResolver
): number | string | null {
  if (!user) {
    return null;
  }

  if (resolver) {
    return resolver(user) ?? null;
  }

  for (const path of FALLBACK_CANDIDATE_PATHS) {
    const value = getByPath(user, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}
