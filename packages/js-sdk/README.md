# LLM Crafter JavaScript SDK

A simple, lightweight JavaScript SDK for interacting with the LLM Crafter API. Works in both Node.js and browser environments.

## Installation

```bash
npm install @llm-crafter/sdk
```

For Node.js environments, you'll also need to install `node-fetch`:

```bash
npm install node-fetch
```

## Quick Start

```javascript
import { LLMCrafterClient } from '@llm-crafter/sdk';

// Initialize the client
const client = new LLMCrafterClient(
  'your-api-key',
  'https://your-domain.com/api/v1'
);

// Test the connection
const connectionTest = await client.testConnection();
console.log(connectionTest.success ? 'Connected!' : 'Connection failed');
```

## Usage Examples

### Execute a Prompt

```javascript
const promptResult = await client.executePrompt(
  'org_123',      // Organization ID
  'proj_456',     // Project ID
  'greeting',     // Prompt name
  {               // Variables
    name: 'John',
    language: 'English'
  }
);

console.log('Prompt result:', promptResult.data.result);
```

### Agent Chat with Session (Recommended)

```javascript
// Create a session and start chatting
const agentChat = await client.startAgentChat(
  'agent_789',
  'Hello, how are you?'
);

console.log('Agent response:', agentChat.response.data.response);

// Continue the conversation
const followUp = await client.chatWithAgent(
  agentChat.session.session_token,
  'Can you help me with something?',
  agentChat.response.data.conversation_id
);

console.log('Follow-up response:', followUp.data.response);

// Clean up when done
await client.revokeSession(agentChat.session.session_id);
```

### Direct Agent Chat (Simpler)

```javascript
const directChat = await client.chatWithAgentDirect(
  'org_123',
  'proj_456', 
  'agent_789',
  'Quick question!'
);

console.log('Direct chat response:', directChat.data.response);
```

### Get Information

```javascript
// List projects
const projects = await client.getProjects('org_123');

// Get project details
const project = await client.getProject('org_123', 'proj_456');

// List agents in a project
const agents = await client.getAgents('org_123', 'proj_456');

// Get usage statistics
const usage = await client.getUsage();
```

## API Reference

### Constructor

```javascript
new LLMCrafterClient(apiKey, baseUrl, options)
```

- `apiKey` (string): Your LLM Crafter API key
- `baseUrl` (string): Base URL of your LLM Crafter instance
- `options` (object): Optional configuration
  - `timeout` (number): Request timeout in milliseconds (default: 30000)
  - `retryAttempts` (number): Number of retry attempts (default: 3)
  - `retryDelay` (number): Delay between retries in milliseconds (default: 1000)

### Methods

#### Prompt Execution
- `executePrompt(orgId, projectId, promptName, variables)` - Execute a prompt with variables

#### Session Management
- `createAgentSession(agentId, options)` - Create a new agent session
- `getSessions()` - Get all active sessions
- `getSession(sessionId)` - Get session information
- `revokeSession(sessionId)` - Revoke a specific session
- `revokeAllSessions()` - Revoke all sessions

#### Agent Interaction
- `chatWithAgent(sessionToken, message, conversationId?, userIdentifier?, dynamicContext?)` - Chat using session token
- `executeTaskAgent(sessionToken, input, context?)` - Execute a task agent
- `chatWithAgentDirect(orgId, projectId, agentId, message, conversationId?, userIdentifier?, dynamicContext?)` - Direct chat with API key

#### Information Retrieval
- `getAgent(orgId, projectId, agentId)` - Get agent information
- `getAgents(orgId, projectId)` - List agents in a project
- `getProject(orgId, projectId)` - Get project information
- `getProjects(orgId)` - List accessible projects
- `getUsage()` - Get API key usage statistics

#### Convenience Methods
- `startAgentChat(agentId, message, sessionOptions?)` - Create session and start chatting in one call
- `testConnection()` - Test API key connectivity

## Error Handling

The SDK automatically retries failed requests and provides detailed error information:

```javascript
try {
  const result = await client.executePrompt('org_123', 'proj_456', 'greeting', {});
} catch (error) {
  console.error('Status:', error.status);
  console.error('Code:', error.code);
  console.error('Message:', error.message);
  console.error('Response:', error.response);
}
```

## Browser Usage

For browser environments, include the UMD build:

```html
<script src="https://unpkg.com/@llm-crafter/sdk/dist/index.umd.js"></script>
<script>
  const client = new LLMCrafterSDK.LLMCrafterClient('your-api-key', 'https://your-domain.com/api/v1');
  
  client.testConnection().then(result => {
    console.log('Connection test:', result);
  });
</script>
```

## TypeScript Support

Type definitions are included. For better TypeScript experience:

```typescript
import { LLMCrafterClient } from '@llm-crafter/sdk';

const client = new LLMCrafterClient(
  process.env.LLM_CRAFTER_API_KEY!,
  process.env.LLM_CRAFTER_BASE_URL!
);
```

## License

MIT - see LICENSE file for details.
