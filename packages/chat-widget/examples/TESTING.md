# Testing the Chat Widget

## Why Origin is Null

When you open HTML files directly in the browser (using `file://` protocol), the browser sends `Origin: null` for security reasons. This is normal behavior.

## Solution 1: Use a Local Web Server (Recommended)

Instead of opening the file directly, serve it through a local HTTP server:

### Option A: Python (Built-in)

```bash
cd packages/chat-widget/examples
python3 -m http.server 8080
```

Then open: http://localhost:8080/test.html

### Option B: Node.js http-server

```bash
# Install globally (one time)
npm install -g http-server

# Run in examples folder
cd packages/chat-widget/examples
http-server -p 8080
```

Then open: http://localhost:8080/test.html

### Option C: VS Code Live Server

1. Install "Live Server" extension in VS Code
2. Right-click on `test.html`
3. Select "Open with Live Server"

## Solution 2: Development Mode (Already Implemented)

The API key middleware has been updated to allow `null` origin when:

- No domain whitelist is configured on the API key, OR
- Origin is `null` (local development)

## Testing with Real Server

To test the widget in production-like conditions:

```bash
# In the main project directory
npm run dev

# This will start the LLM Crafter server on http://localhost:3000
```

Then update your test.html to use:

```javascript
apiUrl: 'http://localhost:3000';
```

And open test.html via a web server (not file://) as shown above.

## Quick Test Command

From the chat-widget examples directory:

```bash
python3 -m http.server 8080 &
open http://localhost:8080/test.html
```

This will:

1. Start a web server on port 8080
2. Open the test page in your browser
3. The widget will now send proper Origin headers
