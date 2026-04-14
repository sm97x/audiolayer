(function () {
  function getPagePayload() {
    return {
      url: window.location.href,
      title: document.title || "",
      html: document.documentElement ? document.documentElement.outerHTML : "",
      textContent: document.body ? document.body.innerText : "",
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "AUDIOLAYER_GET_PAGE") {
      sendResponse(getPagePayload());
    }
  });
})();
