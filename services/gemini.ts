import { GoogleGenAI } from "@google/genai";
import { AppConfig } from '../types';

// NOTE: In a real app, this key should be proxy-ed or handled more securely if possible,
// but for this task we assume process.env.API_KEY is available and client-side usage is permitted.
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const GeminiService = {
  /**
   * Generates text content, possibly with an image attachment (Vision).
   * Now enables Google Search for real-time information.
   */
  generateText: async (
    prompt: string, 
    history: { role: string; parts: { text: string }[] }[],
    systemInstruction: string,
    image?: string // Base64
  ): Promise<{ text: string; sources?: { title: string; uri: string }[] }> => {
    const ai = getClient();
    
    // Using the 'gemini-2.5-flash' for general speed and vision capabilities.
    const modelId = 'gemini-2.5-flash';

    try {
      if (image) {
        // Single turn with image
        const response = await ai.models.generateContent({
          model: modelId,
          contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
              { text: prompt }
            ]
          },
          config: {
            systemInstruction,
          }
        });
        return { text: response.text || "I analyzed the image but couldn't generate a response." };
      } else {
        // Multi-turn chat with Google Search Grounding
        const chat = ai.chats.create({
          model: modelId,
          history: history.map(h => ({
            role: h.role,
            parts: h.parts
          })),
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }], // Enable Google Search for latest info
          }
        });

        const result = await chat.sendMessage({ message: prompt });
        
        // Extract Grounding Metadata (Sources)
        const sources: { title: string; uri: string }[] = [];
        const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
        
        if (groundingChunks) {
          groundingChunks.forEach((chunk: any) => {
            if (chunk.web) {
              sources.push({ title: chunk.web.title, uri: chunk.web.uri });
            }
          });
        }

        return { 
          text: result.text || "No response generated.",
          sources: sources.length > 0 ? sources : undefined
        };
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  },

  /**
   * Generates an image based on a prompt with optional aspect ratio and style.
   */
  generateImage: async (prompt: string, options?: { aspectRatio?: string, style?: string }) => {
    const ai = getClient();
    // Using the recommended model for image generation
    const modelId = 'gemini-2.5-flash-image';

    // Enhance prompt with style if provided
    let finalPrompt = prompt;
    if (options?.style && options.style !== 'None') {
      finalPrompt = `${options.style} style. ${prompt}`;
    }

    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [{ text: finalPrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: options?.aspectRatio || "1:1"
          }
        }
      });

      // Check for inlineData in parts
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
             return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
      }
      return null;
    } catch (error) {
      console.error("Image Generation Error:", error);
      throw error;
    }
  },

  /**
   * Edits an image based on a prompt and input image.
   */
  editImage: async (base64Image: string, prompt: string) => {
    const ai = getClient();
    const modelId = 'gemini-2.5-flash-image';

    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg', // Assuming jpeg for simplicity, or detect from string
                data: base64Image.split(',')[1]
              }
            },
            { text: prompt }
          ]
        }
      });
      
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
             return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
      }
      return null;
    } catch (error) {
      console.error("Image Edit Error:", error);
      throw error;
    }
  },

  /**
   * Interprets natural language commands to modify app configuration (AI Builder).
   */
  parseAdminCommand: async (currentConfig: AppConfig, command: string): Promise<Partial<AppConfig>> => {
    const ai = getClient();
    const modelId = 'gemini-2.5-flash';

    const systemPrompt = `
      You are the AI Kernel of the "OFFICIAL HK AI" website builder.
      Your task is to interpret natural language commands from the admin and output a JSON object representing the configuration updates.

      Current Configuration Schema:
      - themeColor: string (Hex color code, e.g., #3B82F6)
      - systemInstruction: string (The core prompt for the AI assistant behavior/personality)
      - enableImageGeneration: boolean (true/false)
      - enableCodeAssistant: boolean (true/false)
      - siteName: string (The display name of the website)

      Current Values:
      ${JSON.stringify(currentConfig, null, 2)}

      Rules:
      1. Analyze the user's command to identify what needs to change.
      2. Return ONLY a valid JSON object containing *only* the fields that should change.
      3. If the user wants to change the behavior, personality, or rules, update 'systemInstruction'.
      4. If the user wants to change the design, color, or look, update 'themeColor' with an appropriate hex code.
      5. If the user wants to rename the website, update 'siteName'.
      6. If the user wants to enable/disable specific features like images or coding, update the boolean flags.
      7. Be creative. If the user says "Make it look like a hacker site", choose a green terminal color and a hacking system instruction.
      8. Do not include markdown formatting.
    `;

    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: command,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        }
      });
      
      const text = response.text || "{}";
      return JSON.parse(text);
    } catch (error) {
      console.error("Config Parsing Error:", error);
      return {};
    }
  }
};