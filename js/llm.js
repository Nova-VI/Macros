import { getGithubApiKey } from './db.js';

export async function fetchFoodEmoji(foodName) {
  const apiKey = getGithubApiKey();
  if (!apiKey) return '🍽️';

  try {
    const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Very fast, cheap default
        messages: [
          { 
            role: "system", 
            content: "You are a food emoji assistant. Respond with EXACTLY ONE emoji that best represents the food provided by the user. If the food name is unrecognized, abstract, non-food, or gibberish (e.g. 'djof'), respond with 🍽️. Do not include any other text, punctuation, or explanation." 
          },
          { role: "user", content: foodName }
        ],
        temperature: 0.1
      })
    });

    if (!res.ok) return '🍽️';
    
    const data = await res.json();
    const emoji = data.choices[0].message.content.trim();
    
    return emoji || '🍽️';
  } catch (e) {
    console.error("Emoji fetch failed:", e);
    return '🍽️';
  }
}