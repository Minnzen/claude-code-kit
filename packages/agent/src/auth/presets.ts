import { AnthropicProvider } from "../providers/anthropic.js";
import { OpenAIProvider } from "../providers/openai.js";
import type { ProviderRegistration } from "./types.js";

/**
 * Pre-registered common LLM providers.
 * Users can override any of these or add their own via `registry.register()`.
 */
export const PRESET_PROVIDERS: Record<string, ProviderRegistration> = {
  anthropic: {
    type: "api-key",
    displayName: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6",
    createProvider: (key) => new AnthropicProvider({ apiKey: key }),
  },
  openai: {
    type: "api-key",
    displayName: "OpenAI (GPT)",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
    createProvider: (key) => new OpenAIProvider({ apiKey: key }),
  },
  siliconflow: {
    type: "api-key",
    displayName: "SiliconFlow",
    envVar: "SILICONFLOW_API_KEY",
    baseURL: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-72B-Instruct",
    createProvider: (key) =>
      new OpenAIProvider({ apiKey: key, baseURL: "https://api.siliconflow.cn/v1" }),
  },
  deepseek: {
    type: "api-key",
    displayName: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    createProvider: (key) =>
      new OpenAIProvider({ apiKey: key, baseURL: "https://api.deepseek.com/v1" }),
  },
  moonshot: {
    type: "api-key",
    displayName: "Moonshot (Kimi)",
    envVar: "MOONSHOT_API_KEY",
    baseURL: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-auto",
    createProvider: (key) =>
      new OpenAIProvider({ apiKey: key, baseURL: "https://api.moonshot.cn/v1" }),
  },
  groq: {
    type: "api-key",
    displayName: "Groq",
    envVar: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    createProvider: (key) =>
      new OpenAIProvider({ apiKey: key, baseURL: "https://api.groq.com/openai/v1" }),
  },
  ollama: {
    type: "none",
    displayName: "Ollama (local)",
    defaultModel: "llama3.1",
    createProvider: () =>
      new OpenAIProvider({ apiKey: "ollama", baseURL: "http://localhost:11434/v1" }),
  },
};
