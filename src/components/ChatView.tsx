import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat'
import { useChat } from '@/hooks/useChat'
import { MessageList } from './chat/MessageList'
import { ChatInput } from './chat/ChatInput'
import { TypewriterText } from './TypewriterText'
import { SuggestedQuestions } from './SuggestedQuestions'

export function ChatView() {
  const { t } = useTranslation()
  const chatStore = useChatStore()
  const { handleSend, handleAbort } = useChat()
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const hasSentRef = useRef(false)

  const conversation = chatStore.getCurrentConversation()
  const isStreaming = conversation ? chatStore.isConversationStreaming(conversation.id) : false

  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-send pending question (only once)
  useEffect(() => {
    if (pendingQuestion && !hasSentRef.current) {
      hasSentRef.current = true
      handleSend(pendingQuestion)
      setPendingQuestion(null)
      // Reset the flag after a short delay
      setTimeout(() => {
        hasSentRef.current = false
      }, 100)
    }
  }, [pendingQuestion])

  // Auto-scroll when new content arrives, but do not pull the view if the user scrolled away.
  useEffect(() => {
    if (!conversation) return
    const container = messagesContainerRef.current
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 300
    if (isNearBottom) {
      requestAnimationFrame(() => { container.scrollTop = container.scrollHeight })
    }
  }, [conversation?.updatedAt, conversation?.messages.length])

  // Scroll to bottom on conversation switch
  useEffect(() => {
    if (conversation) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = messagesContainerRef.current
          if (container) container.scrollTop = container.scrollHeight
        })
      })
    }
  }, [conversation?.id])

  // Empty state: center the input
  if (!conversation) {
    const welcomeMessages = t('chat.welcomeMessages', { returnObjects: true }) as string[]

    return (
      <div className="flex-1 flex flex-col h-full items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-3xl flex flex-col items-center gap-8">
          <TypewriterText
            texts={welcomeMessages}
            typingSpeed={100}
            deletingSpeed={50}
            pauseDuration={2000}
            className="text-3xl font-semibold text-foreground"
          />
          <div className="w-full space-y-4">
            <ChatInput onSend={handleSend} onAbort={handleAbort} isStreaming={isStreaming} centered />
            <SuggestedQuestions onSelect={setPendingQuestion} />
          </div>
        </div>
      </div>
    )
  }

  // Normal chat view with messages
  return (
    <div className="flex-1 flex flex-col h-full">
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6">
        <MessageList messages={conversation.messages} isStreaming={isStreaming} />
      </div>
      <ChatInput onSend={handleSend} onAbort={handleAbort} isStreaming={isStreaming} />
    </div>
  )
}
