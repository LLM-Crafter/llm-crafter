# Changelog

All notable changes to the LLM Crafter Chat Widget will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Message Transformer Function**: New `messageTransformer` configuration option allows custom message formatting
  - Transform custom markup patterns (e.g., `[CUSTOMLINK:url|label]`) into HTML elements
  - Works with both streaming and non-streaming responses
  - Applied incrementally during streaming for real-time transformation
  - Example provided in `examples/message-transformer.html`
- **Configurable Powered By Text**: New `poweredByText` option to customize the "Powered by" link text (default: "LLM Crafter")
- **Configurable Human Avatar**: New `humanAvatarText` option to customize the human operator avatar (default: "👤")
- **Configurable Powered By URL**: New `poweredByUrl` option to set the "Powered by" link destination (default: "#")
- **Conversation Polling**: Automatic polling for new messages from human operators
  - Polls every 3 seconds when conversation exists
  - Detects human handoff and displays operator messages in real-time
  - Includes duplicate message prevention
- **Human Handoff Detection**: Automatic detection and UI updates when human operator takes over
  - Shows human operator name and custom avatar
  - Triggers `onHumanTakeover` callback
  - Stops bot responses during human control
- **Streaming Responses**: Real-time message streaming via Server-Sent Events (SSE)
  - Configurable with `enableStreaming` option
  - Falls back to non-streaming mode if disabled or unsupported
  - Character-by-character display for better UX
- **Conversation Continuity**: Maintains context across messages
  - Tracks `conversationId` throughout session
  - Sends conversation ID with subsequent messages
  - Preserves conversation state across page refreshes (when session persists)

### Changed

- Message display now uses `transformMessage()` method instead of direct `escapeHtml()`
- Streaming responses now apply transformation incrementally (innerHTML instead of textContent)
- Improved message deduplication with content-based hashing

### Security

- Message transformer validates URLs to prevent `javascript:` protocol attacks
- All text is HTML-escaped before applying transformations to prevent XSS
- Links open with `rel="noopener noreferrer"` for security

## [0.1.0] - Initial Release

### Added

- Basic chat widget functionality
- Session-based authentication
- Customizable appearance (colors, text, positioning)
- Mobile responsive design
- Error handling and callbacks
- Welcome message support
- Multiple deployment options (script tag, NPM)
