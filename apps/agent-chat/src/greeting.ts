/** "Good morning", "Good afternoon" or "Good evening", by the officer's local clock. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 5 || hour >= 18) return "Good evening";
  return hour < 12 ? "Good morning" : "Good afternoon";
}
