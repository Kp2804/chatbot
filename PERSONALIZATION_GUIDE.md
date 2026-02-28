# 👤 Personalized User Experience Guide

Your chatbot now addresses users by their proper names! This creates a more engaging and personal conversation experience.

## 🎯 How It Works

### 1. **Auto-Detection** (Automatic)
The widget automatically searches your website for user names in common HTML elements:

```html
<!-- Any of these will be detected automatically -->
<div class="user-name">Sarah Johnson</div>
<span class="username">Mike Davis</span>
<div id="user-name">Emily Brown</div>
<p class="profile-name">Alex Chen</p>
<div data-user-name="Jessica Wilson"></div>
```

**Common selectors checked:**
- `.user-name`
- `.username`
- `#user-name`
- `.profile-name`
- `.account-name`
- `[data-user-name]`
- `[data-username]`

### 2. **Manual Assignment** (Explicit)
Pass the user's name directly in the widget script:

```html
<script
  src="http://localhost:3000/chatbot-widget.js"
  data-chatbot-id="YOUR_CHATBOT_ID"
  data-user-name="John Smith"
></script>
```

### 3. **Dynamic Assignment** (JavaScript)
Set the name dynamically from your application:

```javascript
// Get user from your auth system
const currentUserName = getUserName(); // Your function

// Create script with user name
const script = document.createElement('script');
script.src = 'http://localhost:3000/chatbot-widget.js';
script.setAttribute('data-chatbot-id', 'YOUR_CHATBOT_ID');
script.setAttribute('data-user-name', currentUserName);
document.body.appendChild(script);
```

## 💬 Conversation Examples

### Without User Name:
```
AI: Hello! How can I help you today?
User: I need help with my order
AI: I'd be happy to help with your order. What's your order number?
```

### With User Name (John Smith):
```
AI: Hello John! How can I help you today?
User: I need help with my order
AI: Of course, John. I'd be happy to help with your order. What's your order number?
```

## 🔧 Implementation Details

### Frontend (Widget)
1. **Detection**: Searches DOM for name elements
2. **Extraction**: Gets text content or data attributes
3. **Validation**: Ensures name is reasonable (1-50 chars)
4. **Transmission**: Passes name via URL parameter to iframe

### Frontend (ChatInterface)
1. **Receives**: Gets name from URL params (`?userName=John`)
2. **Stores**: Keeps name in component state
3. **Sends**: Includes name in all API requests to backend

### Backend (AI)
1. **Receives**: Extracts `userName` from request body
2. **Processes**: Gets first name only (e.g., "John" from "John Smith")
3. **Instructs**: Adds personalization instruction to AI system prompt
4. **Result**: AI naturally uses the name in responses

## 🎨 Customization

### Adjust Name Usage Frequency

Edit `backend/index.ts` lines 100-107:

```typescript
// Current: Uses name naturally
if (userName && userName.trim()) {
  const firstName = userName.trim().split(' ')[0];
  systemPrompt += ` When appropriate, address the user by their name: ${firstName}. Use their name naturally in conversation, especially in greetings and when emphasizing points.`;
}

// Option 1: Use name in every response
systemPrompt += ` Always address the user as ${firstName} in your responses.`;

// Option 2: Use name sparingly
systemPrompt += ` Occasionally address the user as ${firstName}, but keep it natural.`;

// Option 3: Use name only in greeting
systemPrompt += ` Address the user as ${firstName} in your greeting, then use it sparingly.`;
```

### Extract Different Name Parts

```typescript
// Current: First name only
const firstName = userName.trim().split(' ')[0];

// Option: Last name
const lastName = userName.trim().split(' ').pop();

// Option: Full name
const fullName = userName.trim();

// Option: First name + last initial
const parts = userName.trim().split(' ');
const nameToUse = parts.length > 1 
  ? `${parts[0]} ${parts[1][0]}.` 
  : parts[0];
```

## 📊 Data Flow

```
Website Page
    ↓
Widget Script (auto-detect or explicit)
    ↓
Iframe URL (?userName=John)
    ↓
EmbeddedChatPage Component
    ↓
ChatInterface Component
    ↓
API Request to Backend
    ↓
AI System Prompt (includes name)
    ↓
Groq AI Response (uses name)
    ↓
Display to User
```

## 🔒 Privacy & Security

### What We Store
- ✅ User name temporarily in memory during conversation
- ✅ Name passed to AI for current session only
- ❌ Name NOT permanently stored in database
- ❌ Name NOT logged or tracked

### Best Practices
1. **Get consent**: Inform users their name is used for personalization
2. **Sanitize input**: Widget validates name length (1-50 chars)
3. **First name only**: Backend extracts only first name for privacy
4. **No tracking**: Names aren't stored or used for analytics

## 🧪 Testing

### Test Auto-Detection
Create a test page with user name element:

```html
<!DOCTYPE html>
<html>
<body>
  <div class="user-name">Test User</div>
  
  <script
    src="http://localhost:3000/chatbot-widget.js"
    data-chatbot-id="YOUR_ID"
  ></script>
</body>
</html>
```

### Test Manual Assignment
```html
<script
  src="http://localhost:3000/chatbot-widget.js"
  data-chatbot-id="YOUR_ID"
  data-user-name="Sarah Thompson"
></script>
```

### Test Different Names
Try variations to ensure proper handling:
- Short: "Sam"
- Long: "Christopher Alexander Thompson"
- Special chars: "Mary-Jane O'Connor"
- Multiple spaces: "John  Smith"

## 💡 Integration Examples

### WordPress
```php
<?php
// Get current user
$current_user = wp_get_current_user();
$user_name = $current_user->display_name;
?>

<script>
  const userName = <?php echo json_encode($user_name); ?>;
  const script = document.createElement('script');
  script.src = 'http://localhost:3000/chatbot-widget.js';
  script.setAttribute('data-chatbot-id', 'YOUR_ID');
  script.setAttribute('data-user-name', userName);
  document.body.appendChild(script);
</script>
```

### React
```jsx
import { useAuth } from './auth';

function App() {
  const { user } = useAuth();
  
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'http://localhost:3000/chatbot-widget.js';
    script.setAttribute('data-chatbot-id', 'YOUR_ID');
    if (user?.name) {
      script.setAttribute('data-user-name', user.name);
    }
    document.body.appendChild(script);
    
    return () => document.body.removeChild(script);
  }, [user]);
  
  return <div>Your App</div>;
}
```

### Vue.js
```vue
<script setup>
import { onMounted } from 'vue';
import { useUser } from '@/composables/useUser';

const { user } = useUser();

onMounted(() => {
  const script = document.createElement('script');
  script.src = 'http://localhost:3000/chatbot-widget.js';
  script.setAttribute('data-chatbot-id', 'YOUR_ID');
  if (user.value?.name) {
    script.setAttribute('data-user-name', user.value.name);
  }
  document.body.appendChild(script);
});
</script>
```

## 🎯 Benefits

### For Users
- ✨ Personal, human-like conversations
- 🤝 Feels more engaging and friendly
- 💬 Natural dialogue flow
- ⭐ Better user experience

### For Business
- 📈 Higher engagement rates
- 💯 More satisfied customers
- 🎨 Premium brand experience
- 🤖 Seamless AI integration

## 📝 Demo Page

A full demo page is included: `demo-personalized-chat.html`

Open it in your browser to see the personalized chatbot in action!

---

**Status:** ✅ Personalization Active - Your chatbot now addresses users by name!
