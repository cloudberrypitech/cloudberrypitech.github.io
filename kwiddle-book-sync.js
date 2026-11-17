"use strict";
// Serve the online reader's catalogue and ODT files from this GitHub Pages
// site. The reader no longer depends on GitHub's rate-limited unauthenticated API.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const apiPrefix = "https://api.github.com/repos/cloudberrypitech/kwiddle/contents/src/kwiddle/books";
  const rawPrefix = "https://raw.githubusercontent.com/cloudberrypitech/kwiddle/main/src/kwiddle/books/";

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (url.startsWith(apiPrefix)) {
      return nativeFetch("./books/kwiddle/manifest.json?cache=" + Date.now(), {
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
    }
    if (url.startsWith(rawPrefix)) {
      const encodedName = url.slice(rawPrefix.length).split("?")[0];
      let name;
      try { name = decodeURIComponent(encodedName); }
      catch { return new Response("Invalid book filename", { status: 400 }); }
      if (!name || name.includes("/") || name.includes("\\\\") || name === "." || name === "..") {
        return new Response("Invalid book filename", { status: 400 });
      }
      return nativeFetch("./books/kwiddle/" + encodeURIComponent(name), {
        ...init,
        cache: "no-store"
      });
    }
    return nativeFetch(input, init);
  };
})();
