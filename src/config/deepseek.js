// ============================================================================
// DeepSeek AI Integration Wrapper
// Model: deepseek-chat
// API Endpoint: https://api.deepseek.com/chat/completions
// ============================================================================

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/**
 * Generates an AI draft reply to a Google Play Store user review using DeepSeek.
 * @param {string} reviewText The content of the user review
 * @param {number} starRating Star rating (1 to 5)
 * @returns {Promise<string>} Generated draft reply (under 350 characters)
 */
async function generateReply(reviewText, starRating) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('[DEEPSEEK ERROR] DEEPSEEK_API_KEY environment variable is not defined.');
  }

  const systemPrompt = `You are a helpful customer support representative responding to a Google Play Store user review.
Guidelines:
1. Write a short, genuine, and specific reply MUST BE UNDER 350 CHARACTERS total.
2. Tone matching star rating:
   - For 1 or 2 stars: Be empathetic, apologetic, and constructive.
   - For 3 stars: Be balanced, open to improvement, and helpful.
   - For 4 or 5 stars: Be warm, enthusiastic, and appreciative.
3. Reference specific feedback points mentioned by the user if present.
4. Thank the user for their review.
5. NEVER use generic canned phrases like "we value your feedback" as a standalone line.
6. Return ONLY the final response text with no extra commentary or quotes.`;

  const userPrompt = `User Review (${starRating}/5 stars):\n"${reviewText || '(No text provided)'}"`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API returned HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Unexpected response format from DeepSeek API.');
    }

    let replyText = data.choices[0].message.content.trim();

    // Remove wrapping quotes if AI included them
    if ((replyText.startsWith('"') && replyText.endsWith('"')) || (replyText.startsWith("'") && replyText.endsWith("'"))) {
      replyText = replyText.slice(1, -1).trim();
    }

    // Safety fallback: truncate to 350 characters if necessary
    if (replyText.length > 350) {
      replyText = replyText.substring(0, 347) + '...';
    }

    return replyText;

  } catch (error) {
    throw new Error(`[DEEPSEEK ERROR] Failed to generate AI reply: ${error.message}`);
  }
}

module.exports = {
  generateReply,
};
