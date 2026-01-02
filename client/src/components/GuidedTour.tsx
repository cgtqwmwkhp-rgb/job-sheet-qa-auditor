import React, { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useLocation } from "wouter";

interface GuidedTourProps {
  tourId: string;
  steps: {
    element: string;
    popover: {
      title: string;
      description: string;
      side?: "left" | "right" | "top" | "bottom";
      align?: "start" | "center" | "end";
    };
  }[];
  onComplete?: () => void;
}

export function GuidedTour({ tourId, steps, onComplete }: GuidedTourProps) {
  const [location] = useLocation();

  useEffect(() => {
    // Check if this tour has already been seen
    const hasSeenTour = localStorage.getItem(`tour_seen_${tourId}`);
    
    // Only run if not seen and we are on the client side
    if (!hasSeenTour) {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        steps: steps,
        onDestroyed: () => {
          localStorage.setItem(`tour_seen_${tourId}`, "true");
          if (onComplete) onComplete();
        },
      });

      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        driverObj.drive();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [tourId, steps, onComplete, location]);

  return null;
}
