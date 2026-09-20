import getByPath from "./getByPath";

export type UserDisplayNameResolver = (user: any) => string | null | undefined;

// Chemins essayés uniquement quand le projet consommateur n'a pas fourni son
// propre résolveur via `audit.resolveUserDisplayName` — la forme du user (full_name,
// fullName, name...) est propre à chaque application, ne pas la deviner en dur.
const FALLBACK_CANDIDATE_PATHS = [
  "full_name",
  "fullName",
  "fullname",
  "name",
  "username",
  "email",
];

export default function resolveUserDisplayName(
  user: any,
  resolver?: UserDisplayNameResolver
): string | null {
  if (!user) {
    return null;
  }

  if (resolver) {
    return resolver(user) ?? null;
  }

  for (const path of FALLBACK_CANDIDATE_PATHS) {
    const value = getByPath(user, path);
    if (value) {
      return value;
    }
  }

  return null;
}
