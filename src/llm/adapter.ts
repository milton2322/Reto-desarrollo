export interface ChatMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; name?: string; toolCallId?: string; }
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown>; }
export interface LlmReply { text: string; toolCalls: ToolCall[]; responseId?: string; }
export interface LlmAdapter { name: string; model: string; respond(messages: ChatMessage[], tools: ToolDefinition[], previousResponseId?: string): Promise<LlmReply>; }
export interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown>; }
