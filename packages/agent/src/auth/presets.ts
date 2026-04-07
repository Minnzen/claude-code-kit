import { AnthropicProvider } from "../providers/anthropic.js";
import { OpenAIProvider } from "../providers/openai.js";
import type { ProviderRegistration } from "./types.js";

/**
 * Pre-registered common LLM providers.
 * Each supports multiple auth methods — the user picks one during interactive flow.
 * Users can override any of these or add their own via `registry.register()`.
 */
export const PRESET_PROVIDERS: Record<string, ProviderRegistration> = {
  anthropic: {
    displayName: "Anthropic",
    description: "Claude Opus, Sonnet, Haiku",
    authMethods: [
      {
        type: "api-key",
        envVar: "ANTHROPIC_API_KEY",
        inputLabel: "Anthropic API Key",
      },
    ],
    models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-4-6",
    createProvider: ({ apiKey }) => new AnthropicProvider({ apiKey }),
  },
  openai: {
    displayName: "OpenAI",
    description: "GPT-4o, GPT-4, o1",
    authMethods: [
      {
        type: "api-key",
        envVar: "OPENAI_API_KEY",
        inputLabel: "OpenAI API Key",
      },
    ],
    models: ["gpt-4o", "gpt-4-turbo", "o1", "o1-mini"],
    defaultModel: "gpt-4o",
    createProvider: ({ apiKey }) => new OpenAIProvider({ apiKey }),
  },
  deepseek: {
    displayName: "DeepSeek",
    description: "DeepSeek-V3, DeepSeek-R1",
    authMethods: [
      {
        type: "api-key",
        envVar: "DEEPSEEK_API_KEY",
        inputLabel: "DeepSeek API Key",
      },
    ],
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    createProvider: ({ apiKey }) =>
      new OpenAIProvider({ apiKey, baseURL: "https://api.deepseek.com/v1" }),
  },
  siliconflow: {
    displayName: "SiliconFlow",
    description: "Qwen, DeepSeek, GLM via SiliconFlow",
    authMethods: [
      {
        type: "base-url-key",
        defaultBaseURL: "https://api.siliconflow.cn/v1",
        envVar: "SILICONFLOW_API_KEY",
        inputLabel: "SiliconFlow API Key",
      },
    ],
    models: ["Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"],
    defaultModel: "Qwen/Qwen2.5-72B-Instruct",
    createProvider: ({ apiKey, baseURL }) =>
      new OpenAIProvider({
        apiKey,
        baseURL: baseURL || "https://api.siliconflow.cn/v1",
      }),
  },
  moonshot: {
    displayName: "Moonshot (Kimi)",
    description: "Kimi K2.5, Moonshot v1",
    authMethods: [
      {
        type: "api-key",
        envVar: "MOONSHOT_API_KEY",
        inputLabel: "Moonshot API Key",
      },
    ],
    models: ["moonshot-v1-auto", "kimi-k2.5"],
    defaultModel: "moonshot-v1-auto",
    createProvider: ({ apiKey }) =>
      new OpenAIProvider({ apiKey, baseURL: "https://api.moonshot.cn/v1" }),
  },
  groq: {
    displayName: "Groq",
    description: "Fast inference for Llama, Mixtral",
    authMethods: [
      {
        type: "api-key",
        envVar: "GROQ_API_KEY",
        inputLabel: "Groq API Key",
      },
    ],
    models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    defaultModel: "llama-3.3-70b-versatile",
    createProvider: ({ apiKey }) =>
      new OpenAIProvider({
        apiKey,
        baseURL: "https://api.groq.com/openai/v1",
      }),
  },
  ollama: {
    displayName: "Ollama (local)",
    description: "Local models via Ollama",
    authMethods: [{ type: "none" }],
    models: ["llama3.1", "qwen2.5", "mistral"],
    defaultModel: "llama3.1",
    createProvider: () =>
      new OpenAIProvider({
        apiKey: "ollama",
        baseURL: "http://localhost:11434/v1",
      }),
  },
  custom: {
    displayName: "Custom (OpenAI-compatible)",
    description: "Any OpenAI-compatible API endpoint",
    authMethods: [
      {
        type: "base-url-key",
        defaultBaseURL: "",
        inputLabel: "Base URL + API Key",
      },
    ],
    createProvider: ({ apiKey, baseURL }) => new OpenAIProvider({ apiKey: apiKey || "x", baseURL }),
  },
};
