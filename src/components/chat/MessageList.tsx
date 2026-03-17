import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useState } from 'react'
import { Brain, Check, Loader2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Message, MessageBlock, ToolCallData } from '@/types'
import { formatToolArgs, formatToolResult, summarizeToolCall } from '@/lib/tool-call-display'
import { ThinkingDialog } from './ThinkingDialog'

const ASSISTANT_CONTENT_OFFSET = 'ml-10 max-w-[calc(85%-2.5rem)]'
const MESSAGE_MAX_WIDTH = 'max-w-[85%]'

function ToolCallBlockView({ toolCall }: { toolCall: ToolCallData }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const argsText = formatToolArgs(toolCall.args)
  const resultText = formatToolResult(toolCall.result)
  const isRunning = toolCall.status === 'running'
  const isError = toolCall.status === 'error'
  const summary = summarizeToolCall({
    toolName: toolCall.toolName,
    args: toolCall.args,
    summary: toolCall.summary,
    summaryStatus: toolCall.summaryStatus,
    pendingLabel: t('chat.toolCall.usingTool'),
  })
  const displayResult = resultText || (isRunning
    ? t('chat.toolCall.running')
    : isError
      ? t('chat.toolCall.failed')
      : t('chat.toolCall.emptyResult'))

  return (
    <div className="my-0.5">
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 flex-shrink-0">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
          ) : isError ? (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <div className="h-3.5 w-3.5 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
            </div>
          )}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="min-w-0 text-left text-[13px] leading-5 text-muted-foreground/90 hover:text-foreground transition-colors"
        >
          <span className="block truncate">{summary}</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 ml-6 rounded-xl border border-border/70 bg-background/70 px-3 py-3">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('chat.toolCall.tool')}: <span className="normal-case text-foreground">{toolCall.toolName}</span>
          </div>

          <div className="mt-3">
            <div className="font-mono text-xs text-muted-foreground">{t('chat.toolCall.args')}:</div>
            <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted/70 px-3 py-2 text-xs text-foreground">
              {argsText}
            </pre>
          </div>

          <div className="mt-3">
            <div className="font-mono text-xs text-muted-foreground">{t('chat.toolCall.result')}:</div>
            <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted/70 px-3 py-2 text-xs text-foreground">
              {displayResult}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function blockKey(block: MessageBlock, index: number): string | number {
  if (block.type === 'tool_call') {
    return block.data.toolCallId
  }
  if (block.type === 'reasoning') {
    return `reasoning-${index}`
  }
  if (block.type === 'text') {
    return `text-${index}`
  }
  return index
}

function ContentBlockView({ block, isUser }: { block: MessageBlock; isUser?: boolean }) {
  if (block.type === 'text') {
    return (
      <div className={`prose prose-sm max-w-none ${isUser ? 'text-inherit [&_*]:text-inherit' : 'dark:prose-invert'}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
      </div>
    )
  }

  if (block.type === 'tool_call') {
    return <ToolCallBlockView toolCall={block.data} />
  }

  return null
}

interface BubbleProps {
  blocks: MessageBlock[]
  isLoading?: boolean
}

function UserContentBubble({ blocks, isLoading }: BubbleProps) {
  return (
    <div className="flex justify-end mb-3">
      <div className={`flex gap-3 ${MESSAGE_MAX_WIDTH} flex-row-reverse`}>
        <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 mt-0.5 bg-primary text-primary-foreground">
          U
        </div>
        <div className="flex-1 min-w-0 rounded-2xl px-4 py-3 bg-primary text-primary-foreground shadow-sm">
          {isLoading && blocks.length === 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <div className="space-y-3">
              {blocks.map((block, i) => <ContentBlockView key={blockKey(block, i)} block={block} isUser />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AssistantTextBubble({ blocks }: { blocks: Extract<MessageBlock, { type: 'text' }>[] }) {
  return (
    <div className="rounded-2xl px-4 py-3 bg-muted/50">
      <div className="space-y-3">
        {blocks.map((block, i) => <ContentBlockView key={blockKey(block, i)} block={block} />)}
      </div>
    </div>
  )
}

type AssistantSegment =
  | { type: 'text'; blocks: Extract<MessageBlock, { type: 'text' }>[] }
  | { type: 'tool_call'; block: Extract<MessageBlock, { type: 'tool_call' }> }

function buildAssistantSegments(blocks: MessageBlock[]): AssistantSegment[] {
  const segments: AssistantSegment[] = []
  let pendingTextBlocks: Extract<MessageBlock, { type: 'text' }>[] = []

  for (const block of blocks) {
    if (block.type === 'reasoning') continue

    if (block.type === 'text') {
      pendingTextBlocks.push(block)
      continue
    }

    if (pendingTextBlocks.length > 0) {
      segments.push({ type: 'text', blocks: pendingTextBlocks })
      pendingTextBlocks = []
    }

    if (block.type === 'tool_call') {
      segments.push({ type: 'tool_call', block })
    }
  }

  if (pendingTextBlocks.length > 0) {
    segments.push({ type: 'text', blocks: pendingTextBlocks })
  }

  return segments
}

function MessageRow({ message }: { message: Message }) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'
  const [showThinking, setShowThinking] = useState(false)

  if (isUser) {
    return <UserContentBubble blocks={message.blocks} />
  }

  // Handle error messages with red rounded box
  if (message.error && message.blocks.length > 0) {
    const errorText = message.blocks
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.content : '')
      .join('')
      .replace(/^Error:\s*/, '') // Remove "Error: " prefix

    return (
      <div className="flex justify-start mb-3">
        <div className={`${ASSISTANT_CONTENT_OFFSET}`}>
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {errorText}
          </div>
        </div>
      </div>
    )
  }

  const visibleSegments = buildAssistantSegments(message.blocks)
  const reasoningBlocks = message.blocks.filter(block => block.type === 'reasoning')
  const hasReasoning = reasoningBlocks.length > 0
  const isLoading = !!message.isLoading

  const reasoningContent = reasoningBlocks
    .map(block => block.type === 'reasoning' ? block.content : '')
    .join('\n\n')

  return (
    <>
      <div className="flex justify-start mb-3">
        <div className={`flex gap-3 ${MESSAGE_MAX_WIDTH}`}>
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 mt-0.5 bg-muted text-muted-foreground">
            AI
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            {visibleSegments.length > 0 ? (
              visibleSegments.map((segment, index) => {
                if (segment.type === 'tool_call') {
                  return <ToolCallBlockView key={segment.block.data.toolCallId} toolCall={segment.block.data} />
                }

                return (
                  <AssistantTextBubble
                    key={`text-segment-${index}`}
                    blocks={segment.blocks}
                  />
                )
              })
            ) : isLoading ? (
              <div className="rounded-2xl px-4 py-3 bg-muted/50">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            ) : null}

            {hasReasoning && !isLoading && (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() => setShowThinking(true)}
              >
                <Brain className="h-3 w-3" />
                {t('chat.reasoningAvailable')}
              </button>
            )}
          </div>
        </div>
      </div>
      {showThinking && <ThinkingDialog content={reasoningContent} onClose={() => setShowThinking(false)} />}
    </>
  )
}

interface MessageListProps {
  messages: Message[]
  isStreaming: boolean
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) return null
  return (
    <div className="max-w-4xl mx-auto">
      {messages.map(msg => <MessageRow key={msg.id} message={msg} />)}
    </div>
  )
}
