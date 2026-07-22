import React from 'react';

export interface ChatHistory {
  id: string;
  title: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chats: ChatHistory[];
  onNewChat: () => void;
}

export default function Sidebar({ isOpen, onClose, chats, onNewChat }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#171717] text-gray-200 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } flex flex-col h-full shadow-2xl md:shadow-none`}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-white">VANI AI</h1>
          <button 
            onClick={onClose} 
            className="md:hidden p-1.5 hover:bg-gray-800 rounded-md transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 py-2">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-3 py-3 bg-[#212121] hover:bg-[#2f2f2f] transition-all duration-200 rounded-xl text-sm font-medium border border-white/10"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3 mt-4">
            Recent
          </div>
          {chats.map((chat) => (
            <button
              key={chat.id}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#212121] transition-colors text-sm truncate text-gray-300"
            >
              {chat.title}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}