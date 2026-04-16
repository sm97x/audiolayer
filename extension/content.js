(function () {
  const MAX_HTML_CHARS = 300000;
  const MAX_TEXT_CHARS = 100000;

  function truncate(value, limit) {
    if (!value || value.length <= limit) {
      return value || "";
    }

    return value.slice(0, limit);
  }

  function getSelectedText() {
    const selection = window.getSelection ? window.getSelection().toString().trim() : "";
    return selection.length >= 120 ? selection : "";
  }

  function sourceHintsForUrl(url, selectedText) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }

    const hostname = (parsed && parsed.hostname.replace(/^www\./, "").toLowerCase()) || "";
    const pathname = (parsed && parsed.pathname.toLowerCase()) || "";
    const search = (parsed && parsed.search.toLowerCase()) || "";
    let hostFamily = "generic";
    let pageIntentHint = "unknown";
    let matchedRule = "";

    if (hostname.endsWith("bbc.co.uk") || hostname.endsWith("bbc.com")) hostFamily = "bbc";
    if (hostname.endsWith("reddit.com") || hostname.endsWith("old.reddit.com")) hostFamily = "reddit";
    if (hostname === "x.com" || hostname.endsWith(".x.com") || hostname === "twitter.com" || hostname.endsWith(".twitter.com")) hostFamily = "x";
    if (hostname === "news.ycombinator.com") hostFamily = "hackernews";
    if (hostname === "github.com") hostFamily = "github";
    if (hostname === "stackoverflow.com" || hostname.endsWith(".stackoverflow.com")) hostFamily = "stackoverflow";

    if (hostFamily === "reddit" && pathname.includes("/comments/")) {
      pageIntentHint = "thread";
      matchedRule = "reddit comments URL";
    } else if (hostFamily === "x" && /\/status\/\d+/.test(pathname)) {
      pageIntentHint = "thread";
      matchedRule = "x/twitter status URL";
    } else if (hostFamily === "hackernews" && pathname === "/item" && search.includes("id=")) {
      pageIntentHint = "thread";
      matchedRule = "hacker news item URL";
    } else if (hostFamily === "github" && /\/(?:issues|discussions)\/\d+/.test(pathname)) {
      pageIntentHint = "thread";
      matchedRule = "github issue/discussion URL";
    } else if (hostFamily === "stackoverflow" && /\/questions\/\d+/.test(pathname)) {
      pageIntentHint = "thread";
      matchedRule = "stackoverflow question URL";
    } else if (/\/(?:docs|documentation|reference|guide|api)\b/.test(pathname)) {
      pageIntentHint = "docs";
      matchedRule = "docs URL path";
    }

    const sourceKind = pathname.endsWith(".pdf") ? "pdf" : "html";
    if (sourceKind === "pdf") {
      pageIntentHint = "docs";
      matchedRule = matchedRule || "pdf URL";
    }

    return {
      sourceKind,
      hostFamily,
      pageIntentHint,
      matchedRule,
      selectedTextLength: selectedText.length,
    };
  }

  function cloneReadableBody() {
    if (!document.body) {
      return null;
    }

    const clone = document.body.cloneNode(true);
    clone
      .querySelectorAll(
        [
          "script",
          "style",
          "noscript",
          "svg",
          "canvas",
          "iframe",
          "nav",
          "footer",
          "form",
          "button",
          "[role='navigation']",
          "[role='banner']",
          "[role='contentinfo']",
          "[aria-hidden='true']",
          "[class*='cookie' i]",
          "[id*='cookie' i]",
          "[class*='newsletter' i]",
          "[class*='advert' i]",
          "[class*='promo' i]",
        ].join(","),
      )
      .forEach((node) => node.remove());

    return clone;
  }

  function getPagePayload() {
    const selectedText = getSelectedText();
    const sourceHints = sourceHintsForUrl(window.location.href, selectedText);

    if (sourceHints.sourceKind === "pdf") {
      return {
        url: window.location.href,
        title: document.title || "",
        textContent: truncate(selectedText, MAX_TEXT_CHARS),
        selectedText,
        sourceHints,
      };
    }

    const clone = cloneReadableBody();
    const textContent = selectedText || clone?.innerText || document.body?.innerText || "";
    const bodyHtml = clone?.innerHTML || document.body?.innerHTML || "";

    return {
      url: window.location.href,
      title: document.title || "",
      html: truncate(`<main>${bodyHtml}</main>`, MAX_HTML_CHARS),
      textContent: truncate(textContent, MAX_TEXT_CHARS),
      selectedText,
      sourceHints,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "AUDIOLAYER_GET_PAGE") {
      sendResponse(getPagePayload());
    }
  });
})();
