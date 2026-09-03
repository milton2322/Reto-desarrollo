import type { ChatMessage, LlmAdapter, LlmReply, ToolDefinition } from './adapter.js';

export class OpenAiAdapter implements LlmAdapter {
  name = 'openai';
  constructor(public model = process.env.OPENAI_MODEL || 'gpt-5.6-terra', private apiKey = process.env.OPENAI_API_KEY) {}

  async respond(messages: ChatMessage[], tools: ToolDefinition[], previousResponseId?: string): Promise<LlmReply> {
    if (!this.apiKey) throw new Error('No hay OPENAI_API_KEY configurada. Usa LLM_PROVIDER=local para la demo sin modelo.');
    const input = previousResponseId
      ? messages.slice(-1).map((message) => message.role === 'tool' ? { type: 'function_call_output', call_id: message.toolCallId, output: message.content } : { role: message.role, content: message.content })
      : messages.map((message) => ({ role: message.role, content: message.content }));
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input, previous_response_id: previousResponseId, tools: tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters })), reasoning: { effort: 'low' } })
    });
    if (!response.ok) throw new Error(`El proveedor LLM no respondio (${response.status}).`);
    const data = await response.json() as { id: string; output_text?: string; output?: Array<{ type: string; call_id?: string; name?: string; arguments?: string }> };
    const toolCalls = (data.output ?? []).filter((item) => item.type === 'function_call').map((item) => ({ id: item.call_id ?? crypto.randomUUID(), name: item.name ?? '', arguments: JSON.parse(item.arguments ?? '{}') }));
    return { text: data.output_text ?? '', toolCalls, responseId: data.id };
  }
}
