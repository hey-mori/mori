export function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
}

export function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
}

export function formatTimeRange(start: string, end?: string): string {
  if (!end) return `${formatTime(start)} - 진행`;
  return `${formatTime(start)} - ${formatTime(end)}`;
}

export function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
