"use client";

import { OperationType } from "../request/types";
import { logger } from "@/lib/client/logger";
import { createRealOpenAIClient, TEST_MODEL } from "../real-client/openai";
import { SystemPromptBuilder } from "./builder/system-prompt";
import { RequestDataBuilder } from "./builder/request-data";
import { FormatBuilder } from "./builder/format";
import {
  createApiKeyManager,
  defaultConfig,
  getUserApiKeyStorageKey,
} from "@/lib/ai/config";
import { authStorage } from "@/lib/client/auth/storage";

export interface AITaskResponse {
  name: string;
  description: string;
}

export interface AITaskInput {
  name: string;
  description: string;
  definition?: string;
}

export interface RequestInput {
  task?: AITaskInput;
  project?: AITaskInput;
  ancestors?: AITaskInput[];
  siblings?: AITaskInput[];
}

const cleanJsonResponse = (content: string): unknown => {
  try {
    const cleaned = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (error) {
    logger.error(
      "Failed to parse AI response",
      { content, error },
      "ai-client parsing"
    );
    throw new Error("Failed to parse AI response");
  }
};

export const processAIRequest = async (
  type: OperationType,
  data: RequestInput
): Promise<AITaskResponse[]> => {
  try {
    logger.debug(
      "[TRACE] Starting client AI request",
      {
        type,
        dataKeys: Object.keys(data),
        data: JSON.stringify(data),
        hasProject: !!data.project,
        hasTask: !!data.task,
        hasAncestors: !!data.ancestors?.length,
      },
      "ai-client request"
    );

    // Get user ID using the same method as in the API key manager component
    let userId: string | undefined;
    try {
      const session = await authStorage.getSession();
      userId = session?.user?._id;

      logger.debug(
        "[TRACE] Retrieved user session from authStorage",
        {
          userId,
          hasSession: !!session,
          sessionKeys: session ? Object.keys(session) : [],
          userKeys: session?.user ? Object.keys(session.user) : [],
        },
        "ai-client auth"
      );

      if (!userId) {
        logger.warn(
          "[TRACE] No user ID found in auth session",
          {},
          "ai-client auth"
        );

        // Fall back to localStorage as a secondary method
        try {
          const userSession = localStorage.getItem("user-session");
          if (userSession) {
            const parsedSession = JSON.parse(userSession);
            if (parsedSession?.userId) {
              userId = parsedSession.userId;
              logger.debug(
                "[TRACE] Retrieved userId from localStorage fallback",
                {
                  userId,
                  parsedSession,
                },
                "ai-client auth"
              );
            }
          }
        } catch (fallbackError) {
          logger.warn(
            "[TRACE] Fallback user ID retrieval failed",
            { error: String(fallbackError) },
            "ai-client auth"
          );
        }
      }
    } catch (sessionError) {
      logger.warn(
        "[TRACE] Failed to get user session from authStorage",
        { error: String(sessionError) },
        "ai-client auth"
      );
    }

    // Add debug logging for API key storage
    logger.debug(
      "[TRACE] Listing all localStorage keys for debugging",
      {},
      "ai-client storage"
    );
    const allKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        if (
          key.includes("api-key") ||
          key.includes("user-session") ||
          key.includes("auth")
        ) {
          allKeys.push(key);
        }
      }
    }
    logger.debug(
      "[TRACE] Found relevant localStorage keys",
      { keys: allKeys },
      "ai-client storage"
    );

    // Configure user-specific storage key
    const storageKey = getUserApiKeyStorageKey(userId);
    const userConfig = {
      ...defaultConfig,
      storageKey: storageKey,
    };

    logger.debug(
      "[TRACE] Using storage key for API key retrieval",
      {
        storageKey,
        userId,
        defaultStorageKey: defaultConfig.storageKey,
        fullConfig: userConfig,
      },
      "ai-client storage"
    );

    // Get API key from localStorage with user-specific config
    const apiKeyManager = createApiKeyManager(userConfig);

    // Check direct localStorage value for debugging
    if (typeof window !== "undefined") {
      try {
        const prefixedKey = `ai_project_planner_${storageKey}`;
        const rawValue = localStorage.getItem(prefixedKey);
        logger.debug(
          "[TRACE] Direct localStorage check",
          {
            prefixedKey,
            hasValue: !!rawValue,
            valueLength: rawValue ? rawValue.length : 0,
          },
          "ai-client storage"
        );
      } catch (e) {
        logger.warn(
          "[TRACE] Error checking direct localStorage",
          { error: String(e) },
          "ai-client error"
        );
      }
    }

    // Check if we have DEV_MODE API key
    if (
      process.env.NODE_ENV === "development" &&
      process.env.USE_DEV_AI_API_KEY === "true"
    ) {
      logger.debug(
        "[TRACE] Development mode detected, checking for dev API key",
        {},
        "ai-client env"
      );
    }

    const apiKey = await apiKeyManager.getKey();
    logger.debug(
      "[TRACE] API key retrieval result",
      {
        keyFound: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0,
        storageKeyUsed: storageKey,
      },
      "ai-client auth"
    );

    if (!apiKey) {
      logger.error(
        "OpenAI API key not found in storage",
        {},
        "ai-client error"
      );
      throw new Error("Please configure your OpenAI API key in the side panel");
    }

    // Build request components
    const systemPrompt = new SystemPromptBuilder({ operation: type }).build();

    try {
      const requestData = new RequestDataBuilder({
        operation: type,
        data: data as Record<string, unknown>,
      }).build();

      logger.debug(
        "[TRACE] Built request components",
        {
          type,
          requestDataKeys: Object.keys(requestData),
        },
        "ai-client request"
      );

      const formatPrompt = new FormatBuilder({ operation: type }).build();

      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: JSON.stringify(requestData) },
        { role: "system" as const, content: formatPrompt },
      ];

      // Create OpenAI client
      const client = createRealOpenAIClient(apiKey);

      logger.debug(
        "[TRACE] Sending request to OpenAI",
        {
          type,
          modelName: TEST_MODEL,
          messageCount: messages.length,
        },
        "ai-client request"
      );

      // Make request
      const response = await client.chat.completions
        .create({
          model: TEST_MODEL,
          messages,
          temperature: 0.7,
        })
        .catch((error) => {
          logger.error(
            "OpenAI API request failed",
            {
              type,
              error: error instanceof Error ? error.message : "Unknown error",
              statusCode: error?.response?.status,
            },
            "ai-client error"
          );
          throw new Error(
            "OpenAI API request failed. Please check your API key configuration."
          );
        });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        logger.error(
          "Invalid AI response format - no content",
          { type },
          "ai-client error"
        );
        throw new Error("Invalid AI response format - no content");
      }

      // Parse response
      logger.debug(
        "[TRACE] Parsing AI response",
        { type, contentLength: content.length },
        "ai-client parsing"
      );
      const parsed = cleanJsonResponse(content);

      // For decompose, handle both array and single object responses
      if (type === "decompose") {
        if (Array.isArray(parsed)) {
          return parsed.map((item) => ({
            name: item.name,
            description: item.description,
          }));
        } else if (typeof parsed === "object" && parsed !== null) {
          // If API returned a single object, wrap it in an array
          return [
            {
              name: (parsed as AITaskResponse).name,
              description: (parsed as AITaskResponse).description,
            },
          ];
        } else {
          logger.error(
            "Invalid response format for decompose",
            { type, parsedType: typeof parsed },
            "ai-client error"
          );
          throw new Error("Invalid response format for decompose");
        }
      }

      // Process response for split/regenerate
      if (type === "split" && !Array.isArray(parsed)) {
        logger.error(
          "Invalid response format - expected array",
          { type, actualType: typeof parsed },
          "ai-client error"
        );
        throw new Error("Invalid response format - expected array");
      }

      let result: AITaskResponse[];
      if (type === "split") {
        result = (parsed as AITaskResponse[]).map((item) => ({
          name: item.name,
          description: item.description,
        }));
      } else {
        result = [
          {
            name: (parsed as AITaskResponse).name,
            description: (parsed as AITaskResponse).description,
          },
        ];
      }

      logger.info(
        "AI request processed successfully",
        {
          type,
          resultCount: result.length,
        },
        "ai-client success"
      );

      return result;
    } catch (buildError) {
      logger.error(
        "[TRACE] Error building request components",
        {
          error:
            buildError instanceof Error
              ? buildError.message
              : String(buildError),
          type,
          data,
        },
        "ai-client error"
      );
      throw buildError;
    }
  } catch (error) {
    logger.error(
      "AI processing failed",
      {
        type,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "ai-client error"
    );
    throw error;
  }
};
