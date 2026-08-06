/**
 * Client MemoryManager — conversation awareness helpers for agent runs.
 * Durable memory stays on the backend; this prepares lean context for requests.
 */

const MAX_TURNS = 16;
const MAX_CHARS = 2000;

export interface ConversationTurn {
  role: string;
  content: string;
}

export class MemoryManager {
  private working = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.working.set(key, value);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.working.get(key) as T | undefined;
  }

  clear(): void {
    this.working.clear();
  }

  summarizeConversation(messages: ConversationTurn[] = []): string {
    return messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-MAX_TURNS)
      .map((m) => {
        const role = m.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${String(m.content).slice(0, MAX_CHARS)}`;
      })
      .join('\n');
  }

  /**
   * Trim message history for agent API payloads (keeps attachments on last turn).
   */
  prepareConversationPayload<T extends ConversationTurn>(
    messages: T[],
    maxTurns = MAX_TURNS
  ): T[] {
    if (messages.length <= maxTurns) return messages;
    return messages.slice(-maxTurns);
  }
}

export const memoryManager = new MemoryManager();
