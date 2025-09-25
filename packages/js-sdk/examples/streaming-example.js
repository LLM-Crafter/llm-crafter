/**
 * Streaming Example for LLM Crafter SDK
 * 
 * This example demonstrates how to use the streaming functionality
 * with both session tokens and API key authentication.
 */

// Import the SDK (adjust path as needed)
const { LLMCrafterClient } = require('../src/index.js');

async function streamingExample() {
  // Initialize the client
  const client = new LLMCrafterClient('your-api-key', 'https://your-domain.com/api/v1');

  try {
    console.log('🚀 Starting streaming example...\n');

    // Method 1: Streaming with Session Token
    console.log('📋 Creating agent session...');
    const session = await client.createAgentSession('your-agent-id');
    console.log('✅ Session created:', session.session_id);

    console.log('\n💬 Starting streaming chat with session token...');
    console.log('Response: ');
    
    await client.chatWithAgentStream(
      session.session_token,
      'Tell me a short joke about programming',
      null, // conversationId
      'example-user', // userIdentifier
      {}, // dynamicContext
      (chunk) => {
        // This function is called for each chunk of the response
        process.stdout.write(chunk);
      },
      (data) => {
        // This function is called when the response is complete
        console.log('\n✅ Chat completed!');
        console.log('Session info:', data.session_info);
        if (data.suggestions) {
          console.log('Suggestions:', data.suggestions);
        }
      },
      (error) => {
        // This function is called if there's an error
        console.error('\n❌ Chat error:', error.message);
      }
    );

    console.log('\n\n🔧 Starting streaming task execution...');
    console.log('Response: ');
    
    await client.executeTaskAgentStream(
      session.session_token,
      'Calculate the sum of numbers from 1 to 10',
      {}, // context
      (chunk) => {
        // This function is called for each chunk of the response
        process.stdout.write(chunk);
      },
      (data) => {
        // This function is called when the task is complete
        console.log('\n✅ Task completed!');
        console.log('Execution ID:', data.execution_id);
        console.log('Session info:', data.session_info);
      },
      (error) => {
        // This function is called if there's an error
        console.error('\n❌ Task error:', error.message);
      }
    );

    // Method 2: Streaming with API Key (Direct)
    console.log('\n\n🔑 Starting streaming chat with API key...');
    console.log('Response: ');
    
    await client.chatWithAgentDirectStream(
      'your-org-id',
      'your-project-id',
      'your-agent-id',
      'What is the capital of France?',
      null, // conversationId
      'api-user', // userIdentifier
      {}, // dynamicContext
      (chunk) => {
        // This function is called for each chunk of the response
        process.stdout.write(chunk);
      },
      (data) => {
        // This function is called when the response is complete
        console.log('\n✅ Direct chat completed!');
        console.log('Conversation ID:', data.conversation_id);
      },
      (error) => {
        // This function is called if there's an error
        console.error('\n❌ Direct chat error:', error.message);
      }
    );

    console.log('\n\n🏁 Example completed successfully!');

  } catch (error) {
    console.error('❌ Example failed:', error.message);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  streamingExample().catch(console.error);
}

module.exports = { streamingExample };
