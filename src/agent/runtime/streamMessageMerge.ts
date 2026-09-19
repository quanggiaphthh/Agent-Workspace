type MessageLike = { id?: string; role?: string; content?: unknown };

type MergeStreamingMessagesOptions = {
  optimisticUserMessageId?: string;
};

function textOf(message: MessageLike): string {
  if (typeof message.content === 'string') return message.content.trim();
  if (!Array.isArray(message.content)) return '';
  return message.content
    .map((part: unknown) => {
      if (!part || typeof part !== 'object') return '';
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === 'text' && typeof candidate.text === 'string' ? candidate.text : '';
    })
    .join('')
    .trim();
}

export function mergeStreamingMessages<T extends MessageLike>(
  localMessages: T[],
  streamedMessages: T[],
  options: MergeStreamingMessagesOptions = {},
): T[] {
  const result = [...localMessages];
  const indexById = new Map(result.map((m, index) => [m.id, index] as const).filter(([id]) => Boolean(id)));

  const optimisticUser = options.optimisticUserMessageId
    ? localMessages.find(message => message.id === options.optimisticUserMessageId && message.role === 'user')
    : undefined;
  const optimisticText = optimisticUser ? textOf(optimisticUser) : '';
  let optimisticEchoSkipped = false;

  for (const message of streamedMessages) {
    const existingIndex = message.id ? indexById.get(message.id) : undefined;
    if (existingIndex !== undefined) {
      result[existingIndex] = message;
      continue;
    }

    if (
      !optimisticEchoSkipped
      && optimisticUser
      && message.role === 'user'
      && optimisticText.length > 0
      && textOf(message) === optimisticText
    ) {
      optimisticEchoSkipped = true;
      continue;
    }

    if (message.id) indexById.set(message.id, result.length);
    result.push(message);
  }
  return result;
}
