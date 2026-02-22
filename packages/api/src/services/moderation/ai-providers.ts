/**
 * AI Providers for Content Moderation
 * Supports Claude, OpenAI, and local fallback
 */

import type { AIProvider, AIAnalysisResult, ContentType } from './types.js';

const MODERATION_PROMPT = `You are a content moderation AI. Analyze the following content and provide safety scores.

Content Type: {contentType}
Content: {content}

Respond with a JSON object containing these scores (0-100, where 0 is safe and 100 is most severe):
{
  "toxicity": <score>,
  "nsfw": <score>,
  "spam": <score>,
  "violence": <score>,
  "hateSpeech": <score>,
  "explanation": "<brief explanation of any concerns>",
  "categories": ["<list of detected categories if any>"]
}

Be thorough but fair. Consider context and intent. Only flag content that genuinely violates community standards.`;

interface AnalysisInput {
  text?: string;
  url?: string;
  type: ContentType;
}

/**
 * Analyze content using Claude
 */
async function analyzeWithClaude(input: AnalysisInput): Promise<AIAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const content = input.text || input.url || '';
  const prompt = MODERATION_PROMPT
    .replace('{contentType}', input.type)
    .replace('{content}', content);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const textContent = data.content.find((c) => c.type === 'text');
  if (!textContent) {
    throw new Error('No text response from Claude');
  }

  // Parse JSON from response
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const scores = JSON.parse(jsonMatch[0]) as {
    toxicity: number;
    nsfw: number;
    spam: number;
    violence: number;
    hateSpeech: number;
    explanation?: string;
    categories?: string[];
  };

  const riskScore = Math.round(
    (scores.toxicity * 0.25) +
    (scores.nsfw * 0.20) +
    (scores.spam * 0.15) +
    (scores.violence * 0.25) +
    (scores.hateSpeech * 0.15)
  );

  return {
    provider: 'claude',
    model: 'claude-3-haiku-20240307',
    riskScore,
    toxicityScore: scores.toxicity,
    nsfwScore: scores.nsfw,
    spamScore: scores.spam,
    violenceScore: scores.violence,
    hateSpeechScore: scores.hateSpeech,
    explanation: scores.explanation,
    categories: scores.categories,
    rawResponse: scores,
  };
}

/**
 * Analyze content using OpenAI
 */
async function analyzeWithOpenAI(input: AnalysisInput): Promise<AIAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const content = input.text || input.url || '';
  const prompt = MODERATION_PROMPT
    .replace('{contentType}', input.type)
    .replace('{content}', content);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const responseText = data.choices[0]?.message?.content || '';

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from OpenAI response');
  }

  const scores = JSON.parse(jsonMatch[0]) as {
    toxicity: number;
    nsfw: number;
    spam: number;
    violence: number;
    hateSpeech: number;
    explanation?: string;
    categories?: string[];
  };

  const riskScore = Math.round(
    (scores.toxicity * 0.25) +
    (scores.nsfw * 0.20) +
    (scores.spam * 0.15) +
    (scores.violence * 0.25) +
    (scores.hateSpeech * 0.15)
  );

  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    riskScore,
    toxicityScore: scores.toxicity,
    nsfwScore: scores.nsfw,
    spamScore: scores.spam,
    violenceScore: scores.violence,
    hateSpeechScore: scores.hateSpeech,
    explanation: scores.explanation,
    categories: scores.categories,
    rawResponse: scores,
  };
}

/**
 * Local fallback analysis using simple heuristics
 */
function analyzeLocally(input: AnalysisInput): AIAnalysisResult {
  const content = (input.text || '').toLowerCase();

  // Simple keyword-based detection (for demo purposes)
  const badWords = ['spam', 'scam', 'click here', 'free money', 'winner'];
  const violentWords = ['kill', 'die', 'murder', 'attack', 'violence'];
  const nsfwWords = ['nude', 'naked', 'xxx', 'porn'];
  const hateWords = ['hate', 'racist', 'bigot'];

  let spamScore = 0;
  let violenceScore = 0;
  let nsfwScore = 0;
  let hateSpeechScore = 0;
  let toxicityScore = 0;

  for (const word of badWords) {
    if (content.includes(word)) spamScore += 20;
  }

  for (const word of violentWords) {
    if (content.includes(word)) violenceScore += 25;
  }

  for (const word of nsfwWords) {
    if (content.includes(word)) nsfwScore += 30;
  }

  for (const word of hateWords) {
    if (content.includes(word)) hateSpeechScore += 25;
  }

  // Cap scores at 100
  spamScore = Math.min(100, spamScore);
  violenceScore = Math.min(100, violenceScore);
  nsfwScore = Math.min(100, nsfwScore);
  hateSpeechScore = Math.min(100, hateSpeechScore);

  // Toxicity is average of hate + violence
  toxicityScore = Math.round((hateSpeechScore + violenceScore) / 2);

  const riskScore = Math.round(
    (toxicityScore * 0.25) +
    (nsfwScore * 0.20) +
    (spamScore * 0.15) +
    (violenceScore * 0.25) +
    (hateSpeechScore * 0.15)
  );

  return {
    provider: 'local',
    model: 'keyword-heuristic-v1',
    riskScore,
    toxicityScore,
    nsfwScore,
    spamScore,
    violenceScore,
    hateSpeechScore,
    explanation: 'Analyzed using local keyword heuristics',
    categories: [],
  };
}

/**
 * Analyze content using configured AI provider
 */
export async function analyzeContent(
  input: AnalysisInput,
  preferredProvider?: AIProvider
): Promise<AIAnalysisResult> {
  // Determine provider order based on preference and availability
  const providers: AIProvider[] = [];

  if (preferredProvider) {
    providers.push(preferredProvider);
  }

  // Add available providers
  if (process.env.ANTHROPIC_API_KEY && !providers.includes('claude')) {
    providers.push('claude');
  }
  if (process.env.OPENAI_API_KEY && !providers.includes('openai')) {
    providers.push('openai');
  }
  if (!providers.includes('local')) {
    providers.push('local');
  }

  // Try providers in order
  for (const provider of providers) {
    try {
      switch (provider) {
        case 'claude':
          return await analyzeWithClaude(input);
        case 'openai':
          return await analyzeWithOpenAI(input);
        case 'local':
          return analyzeLocally(input);
        default:
          continue;
      }
    } catch (error) {
      console.warn(`AI provider ${provider} failed:`, error);
      // Continue to next provider
    }
  }

  // Fallback to local if all else fails
  return analyzeLocally(input);
}

/**
 * Check if any AI provider is available
 */
export function hasAIProvider(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY
  );
}

/**
 * Get available providers
 */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = ['local'];

  if (process.env.ANTHROPIC_API_KEY) {
    providers.unshift('claude');
  }
  if (process.env.OPENAI_API_KEY) {
    providers.unshift('openai');
  }

  return providers;
}
