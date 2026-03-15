import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, User } from '../types';

interface ChatWindowProps {
  partner: User;
  messages: Message[];
  onSend: (text: string) => void;
  onBack: () => void;
  currentUserId: string;
}

/**
 * Tracks visual viewport height — accounts for mobile keyboard.
 * Falls back to window.innerHeight when visualViewport API is unavailable.
 */
function useVisualViewportHeight() {
  const [height, setHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => setHeight(vv.height);
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  return height;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ partner, messages, onSend, onBack, currentUserId }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const vpHeight = useVisualViewportHeight();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Scroll to bottom when keyboard opens/closes (viewport resizes)
  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [vpHeight, scrollToBottom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSend(inputText);
      setInputText('');
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="flex flex-col bg-gray-900 overflow-hidden"
      style={{ height: `${vpHeight}px` }}
    >
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/90 backdrop-blur shrink-0">
        <button onClick={onBack} className="md:hidden p-3 -ml-2 text-gray-400 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7" />
          </svg>
        </button>
        <img src={partner.avatar} alt={partner.name} className="w-10 h-10 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-white truncate">{partner.name}</h3>
          <p className="text-xs text-gray-500">AuraBuja Messenger</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-10">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">Envoyez votre premier message !</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-gray-800 text-gray-100 rounded-tl-sm'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-gray-500'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area — with safe-area padding for notched devices */}
      <div className="shrink-0 bg-gray-900 border-t border-gray-800 px-3 py-2 pb-safe">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ecrivez un message..."
            enterKeyHint="send"
            autoComplete="off"
            className="flex-1 bg-gray-800 border-none rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};
