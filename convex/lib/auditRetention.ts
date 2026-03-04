export const AUDIT_LOG_RETENTION_MONTHS = 4;

export function subtractUtcCalendarMonths(timestampMs: number, months: number) {
  if (months <= 0) {
    return timestampMs;
  }

  const shifted = new Date(timestampMs);
  const sourceDay = shifted.getUTCDate();
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() - months);

  const daysInTargetMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)
  ).getUTCDate();

  shifted.setUTCDate(Math.min(sourceDay, daysInTargetMonth));
  return shifted.getTime();
}

export function auditLogRetentionCutoffTs(nowTimestampMs: number) {
  return subtractUtcCalendarMonths(nowTimestampMs, AUDIT_LOG_RETENTION_MONTHS);
}
