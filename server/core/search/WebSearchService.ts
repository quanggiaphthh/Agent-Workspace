import { GoogleGenAI } from '@google/genai';
import type { AIConfig } from '../../../shared/contracts/ai';
import { CredentialService } from '../ai/CredentialService';
import { toSafeProviderError } from '../ai/credentialRotationPolicy';

export interface WebSearchSource {
  title: string;
  url: string;
}

export interface WebSearchResult {
  answer: string;
  sources: WebSearchSource[];
  searchQueries: string[];
}

function uniqueSources(chunks: any[] | undefined): WebSearchSource[] {
  const seen = new Set<string>();
  const sources: WebSearchSource[] = [];
  for (const chunk of chunks || []) {
    const web = chunk?.web;
    const url = typeof web?.uri === 'string' ? web.uri : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: typeof web?.title === 'string' && web.title.trim() ? web.title.trim() : url,
      url,
    });
  }
  return sources;
}

export class WebSearchService {
  public static async search(userId: string, aiConfig: AIConfig, query: string, abortSignal?: AbortSignal): Promise<WebSearchResult> {
    if (!aiConfig.webSearchEnabled) {
      const err = new Error('Web search is disabled in Agent settings.');
      (err as any).status = 403;
      throw err;
    }

    const credential = await CredentialService.resolveCredential(
      userId,
      aiConfig.agentProvider,
      aiConfig.credentialId,
    );

    const client = new GoogleGenAI({ apiKey: credential.key });
    let response: any;
    try {
      response = await client.models.generateContent({
        model: aiConfig.agentModel,
        contents: query,
        config: {
          tools: [{ googleSearch: {} }],
          abortSignal,
        },
      });
    } catch (err: any) {
      if (abortSignal?.aborted || err?.name === 'AbortError') throw err;
      throw toSafeProviderError(err);
    }

    const grounding = response?.candidates?.[0]?.groundingMetadata;
    const answer = typeof response?.text === 'string'
      ? response.text
      : (response?.candidates?.[0]?.content?.parts || [])
          .map((part: any) => typeof part?.text === 'string' ? part.text : '')
          .filter(Boolean)
          .join('\n');

    return {
      answer: answer || '',
      sources: uniqueSources(grounding?.groundingChunks),
      searchQueries: Array.isArray(grounding?.webSearchQueries)
        ? grounding.webSearchQueries.filter((item: unknown): item is string => typeof item === 'string')
        : [],
    };
  }
}
