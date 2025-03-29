import { OperationType } from './types';
import { createRealOpenAIClient, TEST_MODEL, ChatCompletionMessage } from '../real-client/openai';
import { SystemPromptBuilder } from './builder/system-prompt';
import { RequestDataBuilder } from './builder/request-data';
import { FormatBuilder } from './builder/format';
import { OPENAI_CONFIG } from './constants';
import { logger } from '@/lib/client/logger';

export interface Task {
  name: string;
  description: string;
  definition: string;
}

export interface RequestInput {
  task?: Task;
  project?: Task;
  ancestors?: Task[];
  siblings?: Task[];
}

const validateSplitData = (data: RequestInput): Record<string, unknown> => {
  logger.debug('[TRACE] Validating split data input', {
    hasTask: !!data.task,
    ancestorCount: data.ancestors?.length,
    dataKeys: Object.keys(data)
  });

  if (!data.task || !data.task.name || !data.task.description) {
    logger.error('[TRACE] Invalid task data in split validation', {
      task: data.task
    });
    throw new Error('Task name and description are required for splitting');
  }

  const ancestors = data.ancestors || [];
  logger.debug('[TRACE] Processing ancestors in split validation', {
    ancestorCount: ancestors.length,
    ancestorNames: ancestors.map(a => a.name)
  });

  const result = {
    task_info: {
      name: data.task.name,
      description: data.task.description,
      definition: data.task.definition || 'task'
    },
    ancestors_chain: ancestors.map(a => ({
      name: a.name,
      description: a.description,
      definition: a.definition || 'task'
    }))
  };

  logger.debug('[TRACE] Completed split data validation', {
    taskName: result.task_info.name,
    ancestorCount: result.ancestors_chain.length
  });

  return result;
};

const validateDecomposeData = (data: RequestInput): Record<string, unknown> => {
  if (!data.project || !data.project.name || !data.project.description) {
    throw new Error('Project name and description are required for decomposition');
  }
  return { ...data.project };
};

const validateRegenerateData = (data: RequestInput): Record<string, unknown> => {
  if (!data.ancestors || !data.siblings) {
    throw new Error('Ancestors and siblings are required for regeneration');
  }
  return {
    ancestors_chain: data.ancestors.map(a => ({ ...a })),
    siblings: data.siblings.map(s => ({ ...s }))
  };
};

export const processRequest = async (type: OperationType, data: RequestInput, apiKey?: string) => {
  logger.debug('[TRACE] Starting request processing', {
    type,
    dataKeys: Object.keys(data),
    hasAncestors: !!data.ancestors?.length
  });

  const client = createRealOpenAIClient(apiKey || process.env.OPENAI_API_KEY || '');
  
  const builderData = (() => {
    switch (type) {
      case 'decompose':
        return validateDecomposeData(data);
      case 'split':
        return validateSplitData(data);
      case 'regenerate':
        return validateRegenerateData(data);
      default:
        throw new Error(`Unsupported operation type: ${type}`);
    }
  })();

  logger.debug('[TRACE] Validated request data', {
    type,
    dataKeys: Object.keys(builderData)
  });

  const requestData = new RequestDataBuilder({ operation: type, data: builderData }).build();
  
  logger.debug('[TRACE] Built final request data', {
    type,
    requestDataKeys: Object.keys(requestData)
  });

  const systemPrompt = new SystemPromptBuilder({ operation: type }).build();
  const formatPrompt = new FormatBuilder({ operation: type }).build();
  
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(requestData) },
    { role: 'system', content: formatPrompt }
  ];

  logger.debug('[TRACE] Prepared messages for API', {
    type,
    messageCount: messages.length,
    requestData: requestData
  });

  logger.info('Processing OpenAI request', { 
    type,
    hasAncestors: !!data.ancestors?.length,
    messageCount: messages.length
  });

  try {
    const response = await client.chat.completions.create({
      model: TEST_MODEL,
      messages: messages as ChatCompletionMessage[],
      temperature: OPENAI_CONFIG.temperature,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Invalid response structure from OpenAI');
    }

    // Clean and parse response
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    logger.info('OpenAI request processed successfully', { 
      type,
      usage: response.usage
    });
    
    return {
      content: result,
      usage: response.usage
    };
  } catch (error) {
    logger.error('OpenAI request failed', { type, error });
    throw error;
  }
};
