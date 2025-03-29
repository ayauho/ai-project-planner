/**
 * Utility functions for device and screen detection
 * @file src/lib/client/utils/device-detection.ts
 */

import { logger } from '@/lib/client/logger';

/**
 * Check if the current device is a mobile device
 * Uses both screen size and user agent detection for better reliability
 * @returns {boolean} True if the device is mobile, false otherwise
 */
export const isMobileDevice = (): boolean => {
  try {
    // If not in browser, return false
    if (typeof window === 'undefined') {
      return false;
    }

    // Check screen width first (reliable in most cases)
    const isSmallScreen = window.innerWidth <= 768;
    
    // Check for touch capability
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Check user agent for mobile keywords
    const userAgent = navigator.userAgent.toLowerCase();
    const mobileKeywords = [
      'android', 'iphone', 'ipad', 'ipod', 'blackberry', 'windows phone',
      'opera mini', 'mobile', 'tablet', 'mobi'
    ];
    const hasMobileUserAgent = mobileKeywords.some(keyword => userAgent.includes(keyword));
    
    // Consider it mobile if either screen is small or user agent indicates mobile
    const isMobile = isSmallScreen || (isTouchDevice && hasMobileUserAgent);
    
// Add mobile-view data attribute to body for CSS targeting
    if (isMobile) {
      document.body.setAttribute('data-mobile-view', 'true');
    } else {
      document.body.removeAttribute('data-mobile-view');
    }
    
    return isMobile;
  } catch (error) {
    logger.error('Error detecting mobile device', { 
      error: error instanceof Error ? error.message : String(error) 
    }, 'device-detection mobile-detection error');
    // Default to false on error
    return false;
  }
};

/**
 * Initialize mobile detection and set up listeners
 * Adds data-mobile-view attribute to body and keeps it updated
 * @returns A cleanup function to remove event listeners
 */
export const initMobileDetection = (): (() => void) | undefined => {
  try {
    // Initial check
    const mobile = isMobileDevice();
    logger.debug('Mobile detection initialized', { isMobile: mobile }, 'device-detection mobile-detection initialization');
    
    // Set up listeners for screen size changes
    const handleViewportChange = () => {
      isMobileDevice();
    };
    
    // Listen for both resize and orientation change
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    
    // Return cleanup function
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  } catch (error) {
    logger.error('Failed to initialize mobile detection', { 
      error: error instanceof Error ? error.message : String(error) 
    }, 'device-detection mobile-detection initialization error');
    return undefined;
  }
};

/**
 * Check if the device has touch capability
 * @returns {boolean} True if the device has touch capability
 */
export const hasTouchCapability = (): boolean => {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};
