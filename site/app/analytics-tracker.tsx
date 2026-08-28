"use client";

import { useEffect } from "react";
import { trackEvent } from "./analytics";

export function AnalyticsTracker() {
  useEffect(() => {
    const trackClick = (event: MouseEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>("[data-analytics-event], a[href], button[aria-label='Copy command']");
      if (!element) return;

      if (element.matches("button[aria-label='Copy command']")) {
        void navigator.clipboard.writeText("npx mcp-sec scan").catch(() => undefined);
        trackEvent("scanner_command_copy", { page_path: window.location.pathname });
        return;
      }

      const anchor = element instanceof HTMLAnchorElement ? element : element.closest<HTMLAnchorElement>("a[href]");
      const explicitEvent = element.dataset.analyticsEvent;
      if (explicitEvent) {
        trackEvent(explicitEvent, {
          link_text: element.dataset.analyticsLabel || element.textContent?.trim().slice(0, 100),
          link_url: anchor?.href,
          page_path: window.location.pathname,
        });
        return;
      }

      if (anchor && anchor.hostname !== window.location.hostname) {
        trackEvent("outbound_click", {
          link_text: anchor.textContent?.trim().slice(0, 100),
          link_url: anchor.href,
          link_domain: anchor.hostname,
          page_path: window.location.pathname,
        });
      } else if (anchor?.hash) {
        trackEvent("section_navigation", { link_url: anchor.href, page_path: window.location.pathname });
      }
    };

    document.addEventListener("click", trackClick);
    return () => document.removeEventListener("click", trackClick);
  }, []);

  return null;
}
