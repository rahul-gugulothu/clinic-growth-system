import type {
  IntegrationProvider,
  IntegrationSendResult,
  IntegrationEventRecord,
} from '../../types/integrations.js';

export const mockProvider: IntegrationProvider = {
  provider: 'mock',

  send: async ({
    event,
  }: {
    organizationId: string;
    event: IntegrationEventRecord;
  }): Promise<IntegrationSendResult> => {
    const payload = event.payload ?? {};

    if (payload.mock_fail === true) {
      return {
        success: false,
        error: 'Mock provider simulated failure',
      };
    }

    return {
      success: true,
      providerMessageId: `mock-msg-${event.id}`,
    };
  },

  validate: (_config: Record<string, unknown>): boolean => {
    return true;
  },
};
