/**
 * Loads StatCounter (or any cross-site parser-blocking script) without using document.write.
 *
 * Use this only if you actually use StatCounter in your app.
 * Right now, StatCounter is not present in the repo sources, so this file is a placeholder
 * you can wire up once you identify the correct StatCounter configuration.
 */

export function loadStatCounter({ url, id, containerId } = {}) {
  if (!url || typeof url !== "string") {
    // No-op when misconfigured
    return;
  }

  // Prevent double-insertion across React remounts
  const existing = document.querySelector(`script[src="${url}"]`);
  if (existing) return;

  const script = document.createElement("script");
  script.src = url;
  script.async = true;

  // Some counters require additional params; caller can customize
  if (id) script.setAttribute("data-statcounter-id", id);

  if (containerId) {
    const el = document.getElementById(containerId);
    (el || document.head).appendChild(script);
  } else {
    (document.head || document.body).appendChild(script);
  }
}

