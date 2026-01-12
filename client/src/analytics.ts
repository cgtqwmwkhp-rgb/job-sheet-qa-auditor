/**
 * Analytics Script Loader
 * 
 * Dynamically loads Umami analytics script ONLY when environment variables are configured.
 * This prevents errors from unsubstituted Vite env vars in production.
 */

const ANALYTICS_ENDPOINT = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const ANALYTICS_WEBSITE_ID = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;

export function initAnalytics(): void {
  // Guard: Only load if both env vars are properly configured
  if (!ANALYTICS_ENDPOINT || !ANALYTICS_WEBSITE_ID) {
    if (import.meta.env.DEV) {
      console.log('[Analytics] Disabled - VITE_ANALYTICS_ENDPOINT or VITE_ANALYTICS_WEBSITE_ID not configured');
    }
    return;
  }

  // Guard: Don't load if env var looks like it wasn't substituted
  if (ANALYTICS_ENDPOINT.includes('%') || ANALYTICS_WEBSITE_ID.includes('%')) {
    console.warn('[Analytics] Disabled - env vars appear to be unsubstituted template literals');
    return;
  }

  // Dynamically inject the analytics script
  const script = document.createElement('script');
  script.defer = true;
  script.src = `${ANALYTICS_ENDPOINT}/umami`;
  script.dataset.websiteId = ANALYTICS_WEBSITE_ID;
  
  script.onerror = () => {
    console.warn('[Analytics] Failed to load analytics script');
  };

  document.body.appendChild(script);
  
  if (import.meta.env.DEV) {
    console.log('[Analytics] Loaded Umami analytics');
  }
}
