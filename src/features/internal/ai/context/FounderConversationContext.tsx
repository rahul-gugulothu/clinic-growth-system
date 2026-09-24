import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type {
  FounderConversationSummary,
  FounderConversationRecord,
  FounderConversationMessage,
} from '@/features/internal/ai/types/api';
import {
  listFounderConversations,
  createFounderConversation,
  getFounderConversation,
  renameFounderConversation,
  archiveFounderConversation,
  deleteFounderConversation,
} from '@/api/client';

export interface FounderConversationContextValue {
  conversations: FounderConversationSummary[];
  activeConversation: FounderConversationRecord | null;
  messages: FounderConversationMessage[];
  loading: boolean;
  loadConversations: () => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  createConversation: () => Promise<FounderConversationRecord>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  archiveConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  appendMessage: (message: FounderConversationMessage) => void;
  replaceMessages: (messages: FounderConversationMessage[]) => void;
}

const FounderConversationContext = createContext<FounderConversationContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useFounderConversation() {
  const ctx = useContext(FounderConversationContext);
  if (!ctx) {
    throw new Error('useFounderConversation must be used within FounderConversationProvider');
  }
  return ctx;
}

interface FounderConversationProviderProps {
  children: ReactNode;
}

export function FounderConversationProvider({ children }: FounderConversationProviderProps) {
  const [conversations, setConversations] = useState<FounderConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<FounderConversationRecord | null>(null);
  const [messages, setMessages] = useState<FounderConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const selectConversation = useCallback(async (conversationId: string) => {
    const existing = conversations.find((c) => c.id === conversationId);
    if (existing) {
      setActiveConversation({
        id: existing.id,
        organization_id: '',
        user_id: '',
        clinic_id: existing.clinic_id,
        title: existing.title,
        archived: false,
        created_at: existing.created_at,
        updated_at: existing.updated_at,
      });
    }

    setLoading(true);
    try {
      const data = await getFounderConversation(conversationId);
      setActiveConversation(data.conversation);
      setMessages(data.messages);
    } finally {
      setLoading(false);
    }
  }, [conversations]);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFounderConversations({ limit: 50, offset: 0 });
      setConversations(data.conversations);

      if (data.conversations.length > 0) {
        const mostRecent = data.conversations[0];
        await selectConversation(mostRecent.id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectConversation]);

  const createConversation = useCallback(async () => {
    const data = await createFounderConversation();
    const conv = data.conversation;
    setConversations((prev) => [
      {
        id: conv.id,
        title: conv.title,
        clinic_id: conv.clinic_id,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        last_message_preview: null,
        message_count: 0,
      },
      ...prev,
    ]);
    setActiveConversation(conv);
    setMessages([]);
    return conv;
  }, []);

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    await renameFounderConversation(conversationId, title);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, title } : c)),
    );
    if (activeConversation?.id === conversationId) {
      setActiveConversation((prev) => (prev ? { ...prev, title } : prev));
    }
  }, [activeConversation]);

  const archiveConversation = useCallback(async (conversationId: string) => {
    await archiveFounderConversation(conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));

    if (activeConversation?.id === conversationId) {
      const remaining = conversations.filter((c) => c.id !== conversationId);
      if (remaining.length > 0) {
        await selectConversation(remaining[0].id);
      } else {
        const conv = await createConversation();
        setActiveConversation(conv);
        setMessages([]);
      }
    }
  }, [activeConversation, conversations, selectConversation, createConversation]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    await deleteFounderConversation(conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));

    if (activeConversation?.id === conversationId) {
      const remaining = conversations.filter((c) => c.id !== conversationId);
      if (remaining.length > 0) {
        await selectConversation(remaining[0].id);
      } else {
        const conv = await createConversation();
        setActiveConversation(conv);
        setMessages([]);
      }
    }
  }, [activeConversation, conversations, selectConversation, createConversation]);

  const appendMessage = useCallback((message: FounderConversationMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const replaceMessages = useCallback((newMessages: FounderConversationMessage[]) => {
    setMessages(newMessages);
  }, []);

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FounderConversationContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        loading,
        loadConversations,
        selectConversation,
        createConversation,
        renameConversation,
        archiveConversation,
        deleteConversation,
        appendMessage,
        replaceMessages,
      }}
    >
      {children}
    </FounderConversationContext.Provider>
  );
}
