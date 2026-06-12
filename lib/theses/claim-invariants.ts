export const MIN_CLAIMS = 2;
export const MAX_CLAIMS = 5;

export function canAddClaim(currentCount: number): boolean {
  return currentCount < MAX_CLAIMS;
}

export function canDeleteClaim(currentCount: number): boolean {
  return currentCount > MIN_CLAIMS;
}
