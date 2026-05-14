import { useEffect, useRef } from "react";

/**
 * Simple page title hook
 * @param {string} title - Page title
 * @param {Object} options - Optional configuration
 */
export default function usePageTitle(title, options = {}) {
  const {
    prefix = "",
    suffix = "",
    separator = " | ",
    resetOnUnmount = false,
    defaultTitle = "Virevo"
  } = options;

  const originalTitleRef = useRef(document.title);

  useEffect(() => {
    let newTitle = title || defaultTitle;
    
    if (prefix) {
      newTitle = prefix + separator + newTitle;
    }
    
    if (suffix) {
      newTitle = newTitle + separator + suffix;
    }
    
    document.title = newTitle;

    return () => {
      if (resetOnUnmount) {
        document.title = originalTitleRef.current || defaultTitle;
      }
    };
  }, [title, prefix, suffix, separator, resetOnUnmount, defaultTitle]);
}