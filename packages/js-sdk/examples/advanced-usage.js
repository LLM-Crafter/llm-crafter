// ES Module example
import { LLMCrafterClient } from '@llm-crafter/sdk';

// Example configuration - replace with your actual values
const config = {
  apiKey: process.env.LLM_CRAFTER_API_KEY || 'your-api-key',
  baseUrl: process.env.LLM_CRAFTER_BASE_URL || 'https://your-domain.com/api/v1',
  orgId: process.env.LLM_CRAFTER_ORG_ID || 'your-org-id',
  projectId: process.env.LLM_CRAFTER_PROJECT_ID || 'your-project-id',
  agentId: process.env.LLM_CRAFTER_AGENT_ID || 'your-agent-id',
};

async function advancedExample() {
  const client = new LLMCrafterClient(config.apiKey, config.baseUrl, {
    timeout: 45000, // 45 second timeout
    retryAttempts: 5, // 5 retry attempts
    retryDelay: 2000, // 2 second delay between retries
  });

  try {
    // Get organization projects
    console.log('📁 Fetching projects...');
    const projects = await client.getProjects(config.orgId);
    console.log(`Found ${projects.data.length} projects`);

    // Get project details
    console.log('\n🔍 Getting project details...');
    const project = await client.getProject(config.orgId, config.projectId);
    console.log('Project:', project.data.name);

    // List agents in project
    console.log('\n🤖 Fetching agents...');
    const agents = await client.getAgents(config.orgId, config.projectId);
    console.log(`Found ${agents.data.length} agents`);

    // Create multiple sessions for different conversations
    console.log('\n💬 Creating multiple chat sessions...');
    const sessions = [];

    for (let i = 0; i < 3; i++) {
      const session = await client.createAgentSession(config.agentId, {
        maxInteractions: 50,
        expiresIn: 1800, // 30 minutes
      });
      sessions.push(session.data);
      console.log(`Created session ${i + 1}: ${session.data.session_id}`);
    }

    // Chat in parallel with different sessions
    console.log('\n🗣️ Starting parallel conversations...');
    const conversations = await Promise.all([
      client.chatWithAgent(sessions[0].session_token, 'Tell me a joke'),
      client.chatWithAgent(
        sessions[1].session_token,
        'What is the weather like?'
      ),
      client.chatWithAgent(sessions[2].session_token, 'Help me write an email'),
    ]);

    conversations.forEach((conv, i) => {
      console.log(`Session ${i + 1} response:`, conv.data.response);
    });

    // Get usage statistics
    console.log('\n📊 Getting usage statistics...');
    const usage = await client.getUsage();
    console.log('API usage:', usage.data);

    // Clean up all sessions
    console.log('\n🧹 Cleaning up sessions...');
    await client.revokeAllSessions();
    console.log('All sessions revoked');
  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.status === 401) {
      console.error('Authentication failed. Check your API key.');
    } else if (error.status === 404) {
      console.error('Resource not found. Check your IDs.');
    } else if (error.status === 429) {
      console.error('Rate limited. Please wait before retrying.');
    }
  }
}

// Error handling example
async function errorHandlingExample() {
  const client = new LLMCrafterClient(config.apiKey, config.baseUrl);

  try {
    // This will likely fail with invalid IDs
    await client.executePrompt(
      'invalid-org',
      'invalid-project',
      'invalid-prompt',
      {}
    );
  } catch (error) {
    console.log('\n🔧 Error handling example:');
    console.log('Status:', error.status);
    console.log('Code:', error.code);
    console.log('Message:', error.message);
    console.log('Full response:', error.response);
  }
}

// Run examples
async function runExamples() {
  console.log('🚀 Running advanced LLM Crafter SDK examples...\n');

  await advancedExample();
  await errorHandlingExample();

  console.log('\n✅ Examples completed!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export { advancedExample, errorHandlingExample };
