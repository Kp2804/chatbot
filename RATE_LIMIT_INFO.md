# Rate Limiting Configuration

## 🛡️ Protection Active

Your chatbot now has rate limiting to protect your Groq API key from excessive usage.

## 📊 Current Limits

- **50 messages per user per day**
- Resets every 24 hours
- Applies per unique user (IP + browser fingerprint)

## 🔍 How It Works

### User Identification
Users are tracked by:
- IP Address
- User Agent (browser info)
- Combined hash for uniqueness

### Reset Period
- Limit resets **24 hours** after first message
- Counter starts fresh after reset
- Old user data cleaned up automatically

## 📈 Rate Limit Headers

Every API response includes these headers:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 2026-02-29T13:45:00.000Z
```

## ⚠️ When Limit is Reached

User sees a friendly message:
```
⚠️ Daily Message Limit Reached

You have reached the daily limit of 50 messages. 
Please try again in X hour(s).

Limit: 50 messages per day
```

## 🔧 Adjust the Limit

To change the limit, edit `backend/index.ts` line 13:

```typescript
const MESSAGE_LIMIT_PER_DAY = 50; // Change this number
```

## 📊 Monitor Usage

Check active users at health endpoint:
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "message": "Chatbot backend is running",
  "rateLimit": {
    "messagesPerDay": 50,
    "activeUsers": 12
  }
}
```

## 💡 Tips

### For Light Usage
- Keep at 50 messages/day
- Most users need < 20 messages

### For Heavy Usage
- Increase to 100-200 messages/day
- Monitor Groq API usage
- Consider user authentication for better tracking

### Production Improvements
Current implementation uses **in-memory storage**. For production:

1. **Use Redis** - Persists across restarts
2. **Use Supabase** - Track per authenticated user
3. **Add IP whitelist** - Exempt trusted IPs
4. **Dynamic limits** - VIP users get higher limits

## 🚨 Bypass Rate Limit

Rate limit does NOT apply to:
- Health check endpoint (`/health`)
- Static assets
- Other non-AI endpoints

## Example Calculation

**Scenario:** 100 daily users, each sends 20 messages
- Total: 2,000 messages/day
- Well within Groq's free tier (14,400/day)
- Your cost: **$0** 🎉

**Scenario:** Power user hits 50-message limit
- Blocks them for 24 hours
- Protects your API key
- They can return tomorrow

## 📝 Logging

Rate limit events are logged to console:
- User reaches limit
- Cleanup of old data
- Active user count

---

**Current Status:** ✅ Rate limiting active and protecting your API key!
