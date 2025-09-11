export interface LLMCrafterClientOptions {
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success?: boolean;
}

export interface PromptExecutionResult {
  result: string;
  execution_id: string;
  timestamp: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AgentSession {
  session_id: string;
  session_token: string;
  agent_id: string;
  expires_at: string;
  max_interactions: number;
  current_interactions: number;
}

export interface AgentResponse {
  response: string;
  conversation_id: string;
  execution_id: string;
  timestamp: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StartChatResult {
  session: AgentSession;
  response: ApiResponse<AgentResponse>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  usage?: any;
  error?: Error;
}

export interface ProjectInfo {
  _id: string;
  name: string;
  description?: string;
  organization: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInfo {
  _id: string;
  name: string;
  description?: string;
  type: 'conversational' | 'task' | 'support';
  system_prompt?: string;
  tools?: string[];
  project: string;
  organization: string;
  is_active: boolean;
}

export interface UsageStats {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_tokens: number;
  last_request_at?: string;
  current_period_start: string;
  current_period_end: string;
}

export declare class LLMCrafterClient {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;

  constructor(apiKey: string, baseUrl: string, options?: LLMCrafterClientOptions);

  // Prompt Execution
  executePrompt(
    orgId: string,
    projectId: string,
    promptName: string,
    variables?: Record<string, any>
  ): Promise<ApiResponse<PromptExecutionResult>>;

  // Session Management
  createAgentSession(
    agentId: string,
    options?: {
      maxInteractions?: number;
      expiresIn?: number;
    }
  ): Promise<ApiResponse<AgentSession>>;

  getSessions(): Promise<ApiResponse<AgentSession[]>>;
  getSession(sessionId: string): Promise<ApiResponse<AgentSession>>;
  revokeSession(sessionId: string): Promise<ApiResponse<{ message: string }>>;
  revokeAllSessions(): Promise<ApiResponse<{ message: string }>>;

  // Agent Execution
  chatWithAgent(
    sessionToken: string,
    message: string,
    conversationId?: string | null,
    userIdentifier?: string | null,
    dynamicContext?: Record<string, any>
  ): Promise<ApiResponse<AgentResponse>>;

  executeTaskAgent(
    sessionToken: string,
    input: string,
    context?: Record<string, any>
  ): Promise<ApiResponse<AgentResponse>>;

  chatWithAgentDirect(
    orgId: string,
    projectId: string,
    agentId: string,
    message: string,
    conversationId?: string | null,
    userIdentifier?: string | null,
    dynamicContext?: Record<string, any>
  ): Promise<ApiResponse<AgentResponse>>;

  // Information Retrieval
  getAgent(orgId: string, projectId: string, agentId: string): Promise<ApiResponse<AgentInfo>>;
  getAgents(orgId: string, projectId: string): Promise<ApiResponse<AgentInfo[]>>;
  getProject(orgId: string, projectId: string): Promise<ApiResponse<ProjectInfo>>;
  getProjects(orgId: string): Promise<ApiResponse<ProjectInfo[]>>;
  getUsage(): Promise<ApiResponse<UsageStats>>;

  // Convenience Methods
  startAgentChat(
    agentId: string,
    message: string,
    sessionOptions?: {
      maxInteractions?: number;
      expiresIn?: number;
    }
  ): Promise<StartChatResult>;

  testConnection(): Promise<ConnectionTestResult>;
}

export default LLMCrafterClient;
