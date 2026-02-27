(function () {
  if (window.__nexusChatbotWidgetLoaded) return;
  window.__nexusChatbotWidgetLoaded = true;

  const script = document.currentScript;
  const chatbotId = script?.getAttribute("data-chatbot-id");
  const appUrl = (script?.getAttribute("data-app-url") || window.location.origin).replace(/\/$/, "");
  const iconUrl = script?.getAttribute("data-icon-url") || "";
  const panelWidth = script?.getAttribute("data-width") || "min(420px, 50vw)";
  const panelHeight = script?.getAttribute("data-height") || "min(80vh, 720px)";

  if (!chatbotId) {
    console.error("[Chatbot Widget] Missing data-chatbot-id attribute");
    return;
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
  panel.style.maxWidth = "50vw";
  panel.style.minWidth = "320px";
  panel.style.height = panelHeight;
  panel.style.maxHeight = "85vh";
  panel.style.borderRadius = "16px";
  panel.style.overflow = "hidden";
  panel.style.boxShadow = "0 16px 40px rgba(0,0,0,0.35)";
  panel.style.border = "1px solid rgba(255,255,255,0.14)";
  panel.style.background = "#0f0f13";
  panel.style.display = "none";

  const iframe = document.createElement("iframe");
  iframe.title = "Nexus Chatbot";
  iframe.src = `${appUrl}/embed/${encodeURIComponent(chatbotId)}`;
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
  launcher.addEventListener("click", function () {
    open = !open;
    panel.style.display = open ? "block" : "none";
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
