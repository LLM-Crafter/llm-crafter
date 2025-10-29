# Message Transformer Implementation Summary

## Overview

Implemented a `messageTransformer` configuration option that allows developers to apply custom transformations to message text before it's displayed in the chat widget.

## What Was Changed

### 1. Core Implementation (`src/index.js`)

#### Added `transformMessage()` Method (Lines ~512-527)

```javascript
transformMessage(text) {
  // Apply custom transformer if provided
  if (this.config.messageTransformer && typeof this.config.messageTransformer === 'function') {
    try {
      return this.config.messageTransformer(text);
    } catch (error) {
      console.warn('Message transformer error:', error);
      // Fallback to escaped HTML if transformer fails
      return this.escapeHtml(text);
    }
  }

  // Default: escape HTML
  return this.escapeHtml(text);
}
```

#### Updated `addMessage()` Method (Line ~543)

- Changed from: `${this.escapeHtml(text)}`
- Changed to: `${transformedText}` where `transformedText = this.transformMessage(text)`
- This applies the transformation for non-streaming messages

#### Updated Streaming Handler (Line ~449)

- Changed from: `bubbleElement.textContent = fullResponse`
- Changed to: `bubbleElement.innerHTML = this.transformMessage(fullResponse)`
- This applies the transformation incrementally during streaming

#### Added Configuration Option (Line ~47)

```javascript
messageTransformer: config.messageTransformer || null;
```

## How It Works

### For Non-Streaming Messages

1. Message received from API
2. `addMessage()` called with message text
3. `transformMessage(text)` is called
4. If `messageTransformer` function exists, it's applied
5. Otherwise, text is HTML-escaped (default behavior)
6. Transformed text is inserted into message bubble

### For Streaming Messages

1. Message chunks arrive via SSE
2. Chunks are accumulated in `fullResponse`
3. After each chunk: `transformMessage(fullResponse)` is called
4. Transformed text replaces the bubble content using `innerHTML`
5. This provides real-time transformation as text streams in

## Security Considerations

### Built-in Safeguards

1. **Error Handling**: If transformer throws an error, falls back to `escapeHtml()`
2. **Default Escaping**: If no transformer provided, HTML is automatically escaped
3. **Try-Catch Wrapper**: Prevents transformer errors from breaking the widget

### Developer Responsibilities

Developers using `messageTransformer` must:

1. **Always escape HTML first** to prevent XSS attacks
2. **Validate URLs** before creating links (prevent `javascript:` protocol)
3. **Use secure attributes** like `rel="noopener noreferrer"` on links
4. **Handle partial text** gracefully (for streaming responses)

## Usage Example

```javascript
const widget = new LLMCrafterChatWidget({
  apiKey: 'your-key',
  agentId: 'your-agent',
  organizationId: 'your-org',
  projectId: 'your-project',

  messageTransformer: text => {
    // 1. Escape HTML to prevent XSS
    const escapeHtml = str => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };

    let escaped = escapeHtml(text);

    // 2. Transform [CUSTOMLINK:url|label] into links
    escaped = escaped.replace(
      /\[CUSTOMLINK:([^\|]+)\|([^\]]+)\]/g,
      (match, url, label) => {
        const safeUrl =
          url.startsWith('http://') || url.startsWith('https://') ? url : '#';
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
    );

    return escaped;
  },
});
```

## Use Cases

1. **Custom Link Formats**: Transform markdown-like patterns into HTML links

   - `[CUSTOMLINK:url|label]` → `<a href="url">label</a>`

2. **Button Elements**: Create interactive buttons

   - `[BUTTON:text]` → `<button>text</button>`

3. **Rich Media**: Embed images, videos, or other media

   - `[IMAGE:url]` → `<img src="url">`

4. **Custom Styling**: Apply special formatting

   - `**bold**` → `<strong>bold</strong>`
   - `*italic*` → `<em>italic</em>`

5. **Interactive Elements**: Create cards, carousels, or other UI components
   - `[CARD:title|description|url]` → Custom card HTML

## Testing

### Manual Testing Steps

1. Configure agent to output custom patterns (e.g., `[CUSTOMLINK:https://google.com|Google]`)
2. Send a message asking for a link
3. Verify the pattern is transformed into a clickable link
4. Test with both streaming enabled and disabled
5. Verify links open in new tab with correct security attributes

### Test Files

- `examples/message-transformer.html` - Comprehensive demo with documentation
- Can add automated tests in the future

## Documentation

Updated files:

- `README.md` - Added messageTransformer to callback options table
- `README.md` - Added "Advanced Message Transformation" section with example
- `CHANGELOG.md` - Documented the new feature
- `examples/message-transformer.html` - Created interactive example

## Performance Considerations

### Streaming Performance

- Transformation is applied after each chunk (not character-by-character)
- Using `innerHTML` instead of `textContent` for transformed content
- Regex operations on accumulated text (may be slow for very long messages)

### Optimization Tips

1. Keep transformation functions lightweight
2. Avoid complex DOM operations
3. Cache regex patterns if possible
4. Consider debouncing for very frequent updates (advanced use case)

## Future Enhancements

Possible improvements:

1. **Pre-built Transformers**: Provide common patterns (Markdown, BBCode, etc.)
2. **Async Transformers**: Support async transformation functions
3. **Transformation Caching**: Cache transformed text to avoid re-processing
4. **Partial Update Optimization**: Only transform new content in streaming mode
5. **Plugin System**: Allow registering multiple transformers as plugins

## Breaking Changes

None - this is a new optional feature that doesn't affect existing implementations.

## Backward Compatibility

✅ Fully backward compatible

- If `messageTransformer` is not provided, behavior is unchanged
- Existing widgets will continue to work exactly as before
- Default behavior is still HTML escaping
