(function () {
  if (window.__nexusChatbotWidgetLoaded) return;
  window.__nexusChatbotWidgetLoaded = true;

  const script = document.currentScript;
  const chatbotId = script?.getAttribute("data-chatbot-id");
  const appUrl = (script?.getAttribute("data-app-url") || window.location.origin).replace(/\/$/, "");
  const iconUrl = script?.getAttribute("data-icon-url") || "";
  const panelWidth = script?.getAttribute("data-width") || "360px";
  const panelHeight = script?.getAttribute("data-height") || "560px";
  const userName = script?.getAttribute("data-user-name") || "";

  if (!chatbotId) {
    console.error("[Chatbot Widget] Missing data-chatbot-id attribute");
    return;
  }

  // Auto-detect user name from common page elements if not provided
  function detectUserName() {
    if (userName) {
      console.log('[Chatbot Widget] Using provided userName:', userName);
      return userName;
    }
    
    console.log('[Chatbot Widget] Attempting to auto-detect user name...');
    
    // Try common selectors for user name
    const selectors = [
      '.user-name',
      '.username', 
      '[data-user-name]',
      '#user-name',
      '.profile-name',
      '.account-name',
      '[data-username]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const name = element.textContent?.trim() || element.getAttribute('data-user-name') || element.getAttribute('data-username');
        if (name && name.length > 0 && name.length < 50) {
          console.log('[Chatbot Widget] Auto-detected userName from', selector + ':', name);
          return name;
        }
      }
    }
    
    console.log('[Chatbot Widget] No user name found');
    return '';
  }

  const container = document.createElement("div");
  container.id = "nexus-chatbot-widget";
  container.style.position = "fixed";
  container.style.right = "16px";
  container.style.bottom = "16px";
  container.style.zIndex = "2147483647";
  container.style.fontFamily = "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  const panel = document.createElement("div");
  panel.style.position = "absolute";
  panel.style.right = "0";
  panel.style.bottom = "64px";
  panel.style.width = panelWidth;
  panel.style.maxWidth = "calc(100vw - 32px)";
  panel.style.minWidth = "320px";
  panel.style.height = panelHeight;
  panel.style.maxHeight = "calc(100vh - 96px)";
  panel.style.borderRadius = "16px";
  panel.style.overflow = "hidden";
  panel.style.boxShadow = "0 16px 40px rgba(0,0,0,0.35)";
  panel.style.border = "1px solid rgba(255,255,255,0.14)";
  panel.style.background = "#0f0f13";
  panel.style.display = "none";

  const iframe = document.createElement("iframe");
  iframe.title = "Nexus Chatbot";
  
  // Build URL with user name parameter
  const detectedUserName = detectUserName();
  let iframeUrl = `${appUrl}/embed/${encodeURIComponent(chatbotId)}`;
  if (detectedUserName) {
    iframeUrl += `?userName=${encodeURIComponent(detectedUserName)}`;
    console.log('[Chatbot Widget] Final iframe URL:', iframeUrl);
  } else {
    console.log('[Chatbot Widget] No userName - iframe URL:', iframeUrl);
  }
  
  iframe.src = iframeUrl;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.background = "#0f0f13";
  panel.appendChild(iframe);

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chatbot");
  launcher.style.width = "56px";
  launcher.style.height = "56px";
  launcher.style.borderRadius = "9999px";
  launcher.style.border = "none";
  launcher.style.cursor = "pointer";
  launcher.style.display = "flex";
  launcher.style.alignItems = "center";
  launcher.style.justifyContent = "center";
  launcher.style.background = "linear-gradient(135deg,#7c3aed,#4f46e5)";
  launcher.style.boxShadow = "0 10px 30px rgba(79,70,229,0.45)";
  launcher.style.color = "#fff";

  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = "Chat";
    img.style.width = "26px";
    img.style.height = "26px";
    img.style.objectFit = "contain";
    launcher.appendChild(img);
  } else {
    launcher.innerHTML = "💬";
    launcher.style.fontSize = "24px";
  }

  let open = false;
  launcher.addEventListener("click", function (event) {
    event.stopPropagation();
    open = !open;
    panel.style.display = open ? "block" : "none";
  });

  // Close on click outside
  document.addEventListener("click", function (event) {
    if (open && !container.contains(event.target)) {
      open = false;
      panel.style.display = "none";
    }
  });

  // Prevent clicks inside panel from closing it
  panel.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      open = false;
      panel.style.display = "none";
    }
  });

  container.appendChild(panel);
  container.appendChild(launcher);
  document.body.appendChild(container);
})();
