import type {
  AuthMethod,
  AuthMethodOAuth,
  AuthRegistry,
  LLMProvider,
  OAuthFlowResult,
} from "@claude-code-kit/agent";
import { Box, Text, useInput } from "@claude-code-kit/ink-renderer";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Divider } from "./Divider";
import { Select, type SelectOption } from "./Select";
import { Spinner } from "./Spinner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthFlowUIProps = {
  auth: AuthRegistry;
  onComplete: (provider: LLMProvider, providerName: string, model: string) => void;
  onCancel?: () => void;
  title?: string;
  /** When true, validate credentials with a test API call before proceeding */
  validateCredentials?: boolean;
};

type FlowPhase =
  | { type: "select-provider" }
  | { type: "select-auth-method"; providerName: string; methods: AuthMethod[] }
  | { type: "input-credentials"; providerName: string; method: AuthMethod; needsBaseURL: boolean }
  | {
      type: "oauth-waiting";
      providerName: string;
      method: AuthMethodOAuth;
      authorizationURL: string;
    }
  | { type: "validating"; providerName: string; method: AuthMethod }
  | {
      type: "select-model";
      providerName: string;
      method: AuthMethod;
      models: string[];
      defaultModel?: string;
    }
  | { type: "done" };

// ---------------------------------------------------------------------------
// Credential input sub-component (simple text input with masking support)
// ---------------------------------------------------------------------------

function CredentialInput({
  label,
  masked,
  onSubmit,
  onCancel,
}: {
  label: string;
  masked?: boolean;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.return) {
      if (value.length > 0) onSubmit(value);
      return;
    }
    if (key.backspace) {
      if (cursor > 0) {
        setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
        setCursor((c) => c - 1);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(value.length, c + 1));
      return;
    }
    if (key.ctrl || key.meta) return;
    if (input.length > 0) {
      setValue((v) => v.slice(0, cursor) + input + v.slice(cursor));
      setCursor((c) => c + input.length);
    }
  });

  const display = masked ? "*".repeat(value.length) : value;
  const before = display.slice(0, cursor);
  const at = cursor < display.length ? display[cursor]! : " ";
  const after = cursor < display.length ? display.slice(cursor + 1) : "";

  return (
    <Box flexDirection="column">
      <Text bold>{label}</Text>
      <Box>
        <Text color="cyan">{"> "}</Text>
        <Text>
          {before}
          <Text inverse>{at}</Text>
          {after}
        </Text>
      </Box>
      {value.length === 0 && <Text dimColor> Type your credential and press Enter</Text>}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Auth method display helpers
// ---------------------------------------------------------------------------

function authMethodLabel(method: AuthMethod): string {
  switch (method.type) {
    case "api-key":
      return "API Key";
    case "base-url-key":
      return "Base URL + API Key";
    case "none":
      return "No authentication";
    case "oauth":
      return "OAuth (browser login)";
  }
}

function authMethodDescription(method: AuthMethod): string | undefined {
  switch (method.type) {
    case "api-key":
      return method.envVar ? `env: ${method.envVar}` : undefined;
    case "base-url-key":
      return method.defaultBaseURL || undefined;
    case "none":
      return "Connect without credentials";
    case "oauth":
      return "Opens browser for authentication";
  }
}

// ---------------------------------------------------------------------------
// AuthFlowUI — main component
// ---------------------------------------------------------------------------

export function AuthFlowUI({
  auth,
  onComplete,
  onCancel,
  title = "Authentication",
  validateCredentials: shouldValidate = false,
}: AuthFlowUIProps): React.ReactNode {
  const [phase, setPhase] = useState<FlowPhase>({ type: "select-provider" });
  const [baseURL, setBaseURL] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const oauthAbortRef = useRef<(() => void) | null>(null);

  // Cleanup OAuth on unmount
  useEffect(() => {
    return () => {
      oauthAbortRef.current?.();
    };
  }, []);

  // Build provider options from the auth registry
  const flowState = auth.interactive();
  const providerOptions: SelectOption<string>[] = (flowState.providers ?? []).map((p) => ({
    value: p.name,
    label: `${p.displayName}`,
    description: p.description,
  }));

  // --- Advance to model or done after credentials are accepted ---

  const advanceAfterCredentials = useCallback(
    async (
      providerName: string,
      method: AuthMethod,
      credentials: { apiKey?: string; baseURL?: string; token?: string },
    ) => {
      try {
        const state = await auth.inputCredentials(providerName, method, credentials);

        if (state.step === "done" && state.result) {
          onComplete(state.result.provider, state.result.providerName, state.result.model);
          setPhase({ type: "done" });
          return;
        }

        if (state.step === "select-model" && state.models) {
          setPhase({
            type: "select-model",
            providerName,
            method,
            models: state.models,
            defaultModel: state.currentModel,
          });
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase({ type: "select-provider" });
      }
    },
    [auth, onComplete],
  );

  // --- Handlers ---

  const handleProviderSelect = useCallback(
    (providerName: string) => {
      setError(undefined);
      try {
        const state = auth.selectProvider(providerName);

        if (state.step === "done" && state.result) {
          onComplete(state.result.provider, state.result.providerName, state.result.model);
          setPhase({ type: "done" });
          return;
        }

        if (state.step === "oauth-pending" && state.currentAuthMethod?.type === "oauth") {
          const method = state.currentAuthMethod as AuthMethodOAuth;
          const flow = auth.startOAuthFlow(providerName, method);
          oauthAbortRef.current = flow.abort;

          setPhase({
            type: "oauth-waiting",
            providerName,
            method,
            authorizationURL: flow.authorizationURL,
          });

          flow.promise
            .then(async (result: OAuthFlowResult) => {
              oauthAbortRef.current = null;
              const nextState = await auth.completeOAuth(providerName, method, result);
              if (nextState.step === "done" && nextState.result) {
                onComplete(
                  nextState.result.provider,
                  nextState.result.providerName,
                  nextState.result.model,
                );
                setPhase({ type: "done" });
              } else if (nextState.step === "select-model" && nextState.models) {
                setPhase({
                  type: "select-model",
                  providerName,
                  method,
                  models: nextState.models,
                  defaultModel: nextState.currentModel,
                });
              }
            })
            .catch((err: unknown) => {
              oauthAbortRef.current = null;
              setError(err instanceof Error ? err.message : String(err));
              setPhase({ type: "select-provider" });
            });
          return;
        }

        if (state.step === "input-credentials" && state.currentAuthMethod) {
          const method = state.currentAuthMethod;
          const needsBaseURL = method.type === "base-url-key" && !method.defaultBaseURL;
          setPhase({
            type: "input-credentials",
            providerName,
            method,
            needsBaseURL,
          });
          return;
        }

        if (state.step === "select-model" && state.models) {
          setPhase({
            type: "select-model",
            providerName,
            method: state.currentAuthMethod!,
            models: state.models,
            defaultModel: state.currentModel,
          });
          return;
        }

        // Multiple auth methods — show selection
        if (state.step === "select-auth-method" && state.authMethods) {
          setPhase({
            type: "select-auth-method",
            providerName,
            methods: state.authMethods,
          });
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [auth, onComplete],
  );

  const handleAuthMethodSelect = useCallback(
    (index: string) => {
      if (phase.type !== "select-auth-method") return;
      setError(undefined);

      const methodIndex = Number.parseInt(index, 10);
      const method = phase.methods[methodIndex];
      if (!method) return;

      if (method.type === "none") {
        const state = auth.selectAuthMethod(phase.providerName, methodIndex);
        if (state.step === "done" && state.result) {
          onComplete(state.result.provider, state.result.providerName, state.result.model);
          setPhase({ type: "done" });
        } else if (state.step === "select-model" && state.models) {
          setPhase({
            type: "select-model",
            providerName: phase.providerName,
            method,
            models: state.models,
            defaultModel: state.currentModel,
          });
        }
        return;
      }

      if (method.type === "oauth") {
        const flow = auth.startOAuthFlow(phase.providerName, method);
        oauthAbortRef.current = flow.abort;

        setPhase({
          type: "oauth-waiting",
          providerName: phase.providerName,
          method,
          authorizationURL: flow.authorizationURL,
        });

        flow.promise
          .then(async (result: OAuthFlowResult) => {
            oauthAbortRef.current = null;
            const nextState = await auth.completeOAuth(phase.providerName, method, result);
            if (nextState.step === "done" && nextState.result) {
              onComplete(
                nextState.result.provider,
                nextState.result.providerName,
                nextState.result.model,
              );
              setPhase({ type: "done" });
            } else if (nextState.step === "select-model" && nextState.models) {
              setPhase({
                type: "select-model",
                providerName: phase.providerName,
                method,
                models: nextState.models,
                defaultModel: nextState.currentModel,
              });
            }
          })
          .catch((err: unknown) => {
            oauthAbortRef.current = null;
            setError(err instanceof Error ? err.message : String(err));
            setPhase({ type: "select-provider" });
          });
        return;
      }

      const needsBaseURL = method.type === "base-url-key" && !method.defaultBaseURL;
      setPhase({
        type: "input-credentials",
        providerName: phase.providerName,
        method,
        needsBaseURL,
      });
    },
    [auth, phase, onComplete],
  );

  const handleBaseURLSubmit = useCallback((url: string) => {
    setBaseURL(url);
  }, []);

  const handleCredentialSubmit = useCallback(
    async (apiKey: string) => {
      if (phase.type !== "input-credentials") return;
      setError(undefined);

      const credentials = {
        apiKey,
        baseURL:
          baseURL ||
          (phase.method.type === "base-url-key" ? phase.method.defaultBaseURL : undefined),
      };

      if (shouldValidate) {
        setPhase({
          type: "validating",
          providerName: phase.providerName,
          method: phase.method,
        });

        try {
          await auth.validateCredentials(phase.providerName, credentials);
          await advanceAfterCredentials(phase.providerName, phase.method, credentials);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase({
            type: "input-credentials",
            providerName: phase.providerName,
            method: phase.method,
            needsBaseURL: phase.needsBaseURL,
          });
        }
      } else {
        await advanceAfterCredentials(phase.providerName, phase.method, credentials);
      }
    },
    [auth, phase, baseURL, shouldValidate, advanceAfterCredentials],
  );

  const handleModelSelect = useCallback(
    async (model: string) => {
      if (phase.type !== "select-model") return;
      setError(undefined);

      try {
        const state = await auth.selectModel(phase.providerName, phase.method, model);
        if (state.step === "done" && state.result) {
          onComplete(state.result.provider, state.result.providerName, state.result.model);
          setPhase({ type: "done" });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [auth, phase, onComplete],
  );

  const handleCancel = useCallback(() => {
    if (phase.type === "select-provider") {
      onCancel?.();
    } else {
      if (phase.type === "oauth-waiting") {
        oauthAbortRef.current?.();
        oauthAbortRef.current = null;
      }
      setPhase({ type: "select-provider" });
      setBaseURL(undefined);
      setError(undefined);
    }
  }, [phase, onCancel]);

  // --- Render ---

  if (phase.type === "done") {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={1}>
      <Box marginBottom={1}>
        <Text bold color="#DA7756">
          {title}
        </Text>
      </Box>
      <Divider />

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        {phase.type === "select-provider" && (
          <Select
            title="Select a provider:"
            options={providerOptions}
            onChange={handleProviderSelect}
            onCancel={handleCancel}
          />
        )}

        {phase.type === "select-auth-method" && (
          <Select
            title="Select authentication method:"
            options={phase.methods.map((m, i) => ({
              value: String(i),
              label: authMethodLabel(m),
              description: authMethodDescription(m),
            }))}
            onChange={handleAuthMethodSelect}
            onCancel={handleCancel}
          />
        )}

        {phase.type === "input-credentials" &&
          phase.method.type === "base-url-key" &&
          phase.needsBaseURL &&
          !baseURL && (
            <CredentialInput
              label="Enter Base URL:"
              masked={false}
              onSubmit={handleBaseURLSubmit}
              onCancel={handleCancel}
            />
          )}

        {phase.type === "input-credentials" &&
          !(phase.method.type === "base-url-key" && phase.needsBaseURL && !baseURL) && (
            <CredentialInput
              label={
                phase.method.type === "api-key" || phase.method.type === "base-url-key"
                  ? (phase.method.inputLabel ?? "Enter API Key:")
                  : "Enter API Key:"
              }
              masked
              onSubmit={handleCredentialSubmit}
              onCancel={handleCancel}
            />
          )}

        {phase.type === "oauth-waiting" && (
          <Box flexDirection="column" gap={1}>
            <Box gap={1}>
              <Spinner verb="Waiting" label="for browser authentication" color="cyan" />
            </Box>
            <Text dimColor> If the browser didn't open, visit:</Text>
            <Text dimColor color="blue">
              {" "}
              {phase.authorizationURL.slice(0, 80)}
              {phase.authorizationURL.length > 80 ? "..." : ""}
            </Text>
          </Box>
        )}

        {phase.type === "validating" && (
          <Box gap={1}>
            <Spinner verb="Validating" label="credentials" color="yellow" />
          </Box>
        )}

        {phase.type === "select-model" && (
          <Select
            title="Select a model:"
            options={phase.models.map((m) => ({
              value: m,
              label: m,
              description: m === phase.defaultModel ? "(default)" : undefined,
            }))}
            defaultValue={phase.defaultModel}
            onChange={handleModelSelect}
            onCancel={handleCancel}
          />
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Esc to {phase.type === "select-provider" ? "cancel" : "go back"}</Text>
      </Box>
    </Box>
  );
}
