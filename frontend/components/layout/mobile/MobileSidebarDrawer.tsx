'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, MessageSquare, Search, FolderKanban, Plus, Settings, Brain, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSummary, Project } from '@/lib/types';
import { SPRING } from '@/lib/motion';

export interface MobileSidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  recentChats: ChatSummary[];
  isLoadingChats: boolean;
  chatsError: string | null;
  activeChatId: string | null;
  projects: Project[];
  pinnedProjects: Project[];
  activeProjectId: string | null;
  projectChats: ChatSummary[];
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onSelectProject: (projectId: string | null) => void;
}

/**
 * MobileSidebarDrawer - Full-height mobile sidebar drawer
 * 
 * Features:
 * - Full-screen overlay drawer
 * - Bottom sheet behavior
 * - Smooth slide-in animation
 * - Chat history, projects, settings
 * - Auto-closes on selection
 * - Safe area support
 */
function MobileSidebarDrawer({
  isOpen,
  onClose,
  recentChats,
  isLoadingChats,
  chatsError,
  activeChatId,
  projects,
  pinnedProjects,
  activeProjectId,
  projectChats,
  onNewChat,
  onSelectChat,
  onSelectProject,
}: MobileSidebarDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleNewChat = useCallback(() => {
    onNewChat();
    onClose();
  }, [onNewChat, onClose]);

  const handleSelectChat = useCallback((chatId: string) => {
    onSelectChat(chatId);
    onClose();
  }, [onSelectChat, onClose]);

  const handleSelectProject = useCallback((projectId: string | null) => {
    onSelectProject(projectId);
    onClose();
  }, [onSelectProject, onClose]);

  // Filter chats based on search
  const filteredChats = searchQuery
    ? recentChats.filter(chat => 
        chat.title?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recentChats;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
            aria-hidden
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={SPRING.snappy}
            className={cn(
              'fixed inset-y-0 left-0 z-50',
              'w-full max-w-[320px]',
              'bg-background',
              'shadow-2xl',
              'flex flex-col'
            )}
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-4">
              <h2 className="text-lg font-semibold tracking-[-0.02em]">
                Menu
              </h2>
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'flex items-center justify-center',
                  'h-10 w-10',
                  'rounded-full',
                  'bg-surface-hover',
                  'text-muted-foreground',
                  'transition-colors',
                  'hover:bg-surface-input hover:text-foreground',
                  'active:scale-95',
                  'touch-manipulation'
                )}
                aria-label="Close menu"
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>

            {/* New Chat Button */}
            <div className="p-4">
              <button
                type="button"
                onClick={handleNewChat}
                className={cn(
                  'flex w-full items-center gap-3',
                  'rounded-xl px-4 py-3',
                  'bg-accent text-text-on-accent',
                  'font-medium',
                  'shadow-sm',
                  'transition-all',
                  'hover:bg-accent-hover',
                  'active:scale-98',
                  'touch-manipulation'
                )}
              >
                <Plus size={20} strokeWidth={1.75} />
                New Chat
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full rounded-xl',
                    'bg-surface-input',
                    'border border-border/70',
                    'py-2.5 pl-10 pr-4',
                    'text-sm',
                    'placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-2 focus:ring-accent/50',
                    'transition-all'
                  )}
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Quick Actions */}
              <div className="px-4 py-2">
                <div className="space-y-1">
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3',
                      'rounded-lg px-3 py-2.5',
                      'text-left text-sm',
                      'text-foreground',
                      'hover:bg-surface-hover',
                      'transition-colors',
                      'touch-manipulation'
                    )}
                  >
                    <MessageSquare size={18} strokeWidth={1.75} className="text-muted-foreground" />
                    <span>Chats</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3',
                      'rounded-lg px-3 py-2.5',
                      'text-left text-sm',
                      'text-foreground',
                      'hover:bg-surface-hover',
                      'transition-colors',
                      'touch-manipulation'
                    )}
                  >
                    <FolderKanban size={18} strokeWidth={1.75} className="text-muted-foreground" />
                    <span>Projects</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3',
                      'rounded-lg px-3 py-2.5',
                      'text-left text-sm',
                      'text-foreground',
                      'hover:bg-surface-hover',
                      'transition-colors',
                      'touch-manipulation'
                    )}
                  >
                    <Brain size={18} strokeWidth={1.75} className="text-muted-foreground" />
                    <span>Memory</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3',
                      'rounded-lg px-3 py-2.5',
                      'text-left text-sm',
                      'text-foreground',
                      'hover:bg-surface-hover',
                      'transition-colors',
                      'touch-manipulation'
                    )}
                  >
                    <BarChart3 size={18} strokeWidth={1.75} className="text-muted-foreground" />
                    <span>Analytics</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3',
                      'rounded-lg px-3 py-2.5',
                      'text-left text-sm',
                      'text-foreground',
                      'hover:bg-surface-hover',
                      'transition-colors',
                      'touch-manipulation'
                    )}
                  >
                    <Settings size={18} strokeWidth={1.75} className="text-muted-foreground" />
                    <span>Settings</span>
                  </button>
                </div>
              </div>

              {/* Recent Chats */}
              {filteredChats.length > 0 && (
                <div className="px-4 py-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent Chats
                  </h3>
                  <div className="space-y-1">
                    {filteredChats.slice(0, 10).map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => handleSelectChat(chat.id)}
                        className={cn(
                          'flex w-full items-center gap-3',
                          'rounded-lg px-3 py-2.5',
                          'text-left text-sm',
                          'transition-colors',
                          'touch-manipulation',
                          activeChatId === chat.id
                            ? 'bg-accent/10 text-accent font-medium'
                            : 'text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <MessageSquare size={16} strokeWidth={1.75} className="shrink-0 opacity-60" />
                        <span className="min-w-0 flex-1 truncate">
                          {chat.title || 'New Chat'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Projects */}
              {projects.length > 0 && (
                <div className="px-4 py-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Projects
                  </h3>
                  <div className="space-y-1">
                    {projects.slice(0, 5).map((project) => (
                      <button
                        key={project._id}
                        type="button"
                        onClick={() => handleSelectProject(project._id)}
                        className={cn(
                          'flex w-full items-center gap-3',
                          'rounded-lg px-3 py-2.5',
                          'text-left text-sm',
                          'transition-colors',
                          'touch-manipulation',
                          activeProjectId === project._id
                            ? 'bg-accent/10 text-accent font-medium'
                            : 'text-foreground hover:bg-surface-hover'
                        )}
                      >
                        <FolderKanban size={16} strokeWidth={1.75} className="shrink-0 opacity-60" />
                        <span className="min-w-0 flex-1 truncate">
                          {project.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default MobileSidebarDrawer;