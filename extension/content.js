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
    const clone = cloneReadableBody();
    const textContent = selectedText || clone?.innerText || document.body?.innerText || "";
    const bodyHtml = clone?.innerHTML || document.body?.innerHTML || "";

    return {
      url: window.location.href,
      title: document.title || "",
      html: truncate(`<main>${bodyHtml}</main>`, MAX_HTML_CHARS),
      textContent: truncate(textContent, MAX_TEXT_CHARS),
      selectedText,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "AUDIOLAYER_GET_PAGE") {
      sendResponse(getPagePayload());
    }
  });
})();
