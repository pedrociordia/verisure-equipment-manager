/**
 * Auto-calculate contract type based on employment duration.
 * < 120 days = "On Call", >= 120 days = "Fixed Term"
 */
export function getContractType(
  salesChannelStart: string | null,
  exitDate: string | null
): 'Fixed Term' | 'On Call' {
  if (!salesChannelStart) return 'On Call';
  const start = new Date(salesChannelStart);
  const end = exitDate ? new Date(exitDate) : new Date();
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return days < 120 ? 'On Call' : 'Fixed Term';
}
