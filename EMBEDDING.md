# Chatbot Website Embedding

Use this script on a customer website to embed the chatbot as a bottom-right launcher widget.

## 1) Include script

```html
<script
  src="https://YOUR_APP_DOMAIN/chatbot-widget.js"
  data-app-url="https://YOUR_APP_DOMAIN"
  data-chatbot-id="YOUR_CHATBOT_ID"
  data-width="min(420px, 50vw)"
  data-height="min(80vh, 720px)"
></script>
```

## 2) Behavior

- Floating launcher appears at bottom-right.
- On click, chatbot panel opens.
- Panel is constrained to at most half of viewport width (`50vw`).
- `Esc` closes the panel.

## 3) Optional attributes

- `data-icon-url`: custom launcher icon URL
- `data-width`: panel width CSS value
- `data-height`: panel height CSS value

## 4) Notes

- Embedded chat loads route `/embed/:chatbotId` from your app.
- The embed page uses anonymous auth when no session exists.
- Ensure your Supabase policies permit the data you want public visitors to access.
