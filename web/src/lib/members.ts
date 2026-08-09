export const MEMBER_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6'];

export function memberColorIndex(userId: string, memberIds: string[]): number {
  const sorted = [...memberIds].sort();
  const index = sorted.indexOf(userId);
  return index >= 0 ? index : 0;
}

export function memberColor(userId: string, memberIds: string[]): string {
  return MEMBER_COLORS[memberColorIndex(userId, memberIds) % MEMBER_COLORS.length];
}

export function memberInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
