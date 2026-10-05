import { analyticsConfigured } from './analytics';
import { openConsent } from './consent';

/** The COOKIES command: open the consent banner, or say there's nothing to consent to. */
export function cookiesCommand(): string {
  if (!analyticsConfigured()) return '[This build has no analytics. Nothing is collected.]';
  openConsent();
  return '[Analytics settings opened]';
}
