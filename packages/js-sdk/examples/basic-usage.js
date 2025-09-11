// Basic usage example for Node.js
const { LLMCrafterClient } = require('@llm-crafter/sdk');

async function basicExample() {
  // Initialize client
  const client = new LLMCrafterClient(
    'your-api-key-here',
    'https://your-domain.com/api/v1'
  );

  try {
    // Test connection
    console.log('Testing connection...');
    const connectionTest = await client.testConnection();
    if (!connectionTest.success) {
      console.error('Connection failed:', connectionTest.message);
      return;
    }
    console.log('✅ Connected successfully!');

    // Execute a prompt
    console.log('\nExecuting prompt...');
    const promptResult = await client.executePrompt(
      'your-org-id',
      'your-project-id',
      'greeting',
      { name: 'World' }
    );
    console.log('Prompt result:', promptResult.data.result);

    // Start agent chat
    console.log('\nStarting agent chat...');
    const agentChat = await client.startAgentChat(
      'your-agent-id',
      'Hello! Can you help me?'
    );
    console.log('Agent response:', agentChat.response.data.response);

    // Continue conversation
    const followUp = await client.chatWithAgent(
      agentChat.session.session_token,
      'What can you do?',
      agentChat.response.data.conversation_id
    );
    console.log('Follow-up response:', followUp.data.response);

    // Clean up
    await client.revokeSession(agentChat.session.session_id);
    console.log('✅ Session cleaned up');
  } catch (error) {
    console.error('Error:', error.message);
    if (error.status) {
      console.error('Status:', error.status);
      console.error('Response:', error.response);
    }
  }
}

// Run the example
if (require.main === module) {
  basicExample().catch(console.error);
}

module.exports = { basicExample };
