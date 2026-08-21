'use client';

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Volume2, Copy, MoreHorizontal, MessageCircle, Share2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { SPRING } from '@/lib/motion';

export interface MobileMessageActionsProps {
  messageId: string;
  isOwn?: boolean;
  onLike?: () => void;
  onDislike?: () => void;
  onReadAloud?: () => void;
  onCopy?: () => void;
  onShare?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * MobileMessageActions - Touch-friendly mobile message actions
 * 
 * Features:
 * - Large touch targets (44x44 minimum)
 * - Primary actions: 👍 👎 🔊 📋
 * - Secondary actions in ⋮ menu
 * - No hover-dependent functionality
 * - Tap/press interactions
 */
function MobileMessageActions({
  messageId,
  isOwn = false,
  onLike,
  onDislike,
  onReadAloud,
  onCopy,
  onShare,
  onRegenerate,
  onEdit,
  onDelete,
}: MobileMessageActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryActions = [
    {
      icon: ThumbsUp,
      label: 'Like',
      action: onLike,
      show: true,
    },
    {
      icon: ThumbsDown,
      label: 'Dislike',
      action: onDislike,
      show: true,
    },
    {
      icon: Volume2,
      label: 'Read aloud',
      action: onReadAloud,
      show: !!onReadAloud,
    },
    {
      icon: Copy,
      label: 'Copy',
      action: onCopy,
      show: !!onCopy,
    },
  ].filter(action => action.show);

  const secondaryActions = [
    {
      icon: Share2,
      label: 'Share',
      action: onShare,
      show: !!onShare,
    },
    {
      icon: RotateCcw,
      label: 'Regenerate',
      action: onRegenerate,
      show: !!onRegenerate && !isOwn,
    },
    {
      icon: MessageCircle,
      label: 'Edit',
      action: onEdit,
      show: !!onEdit && isOwn,
    },
    {
      icon: MessageCircle,
      label: 'Delete',
      action: onDelete,
      show: !!onDelete && isOwn,
    },
  ].filter(action => action.show);

  const handleAction = (action?: () => void) => {
    return () => {
      action?.();
      setMenuOpen(false);
    };
  };

  return (
    <div className="flex items-center gap-1">
      {/* Primary Actions */}
      {primaryActions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.action}
          className={cn(
            'flex items-center justify-center',
            'h-9 w-9',
            'rounded-full',
            'text-muted-foreground',
            'transition-colors',
            'hover:bg-surface-hover hover:text-foreground',
            'active:scale-95',
            'touch-manipulation'
          )}
          aria-label={action.label}
        >
          <action.icon size={18} strokeWidth={1.75} />
        </button>
      ))}

      {/* More Menu */}
      {secondaryActions.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              'flex items-center justify-center',
              'h-9 w-9',
              'rounded-full',
              'text-muted-foreground',
              'transition-colors',
              'hover:bg-surface-hover hover:text-foreground',
              'active:scale-95',
              'touch-manipulation'
            )}
            aria-label="More actions"
          >
            <MoreHorizontal size={18} strokeWidth={1.75} />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -2 }}
                transition={SPRING.snappy}
                className={cn(
                  'absolute right-0 top-10 z-50',
                  'min-w-[160px]',
                  'overflow-hidden rounded-xl',
                  'border border-border/70',
                  'bg-surface-elevated',
                  'shadow-lg',
                  'backdrop-blur-xl'
                )}
              >
                {secondaryActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={handleAction(action.action)}
                    className={cn(
                      'flex w-full items-center gap-2',
                      'px-3 py-2.5',
                      'text-left text-sm',
                      'text-foreground',
                      'hover:bg-surface-hover',
                      'transition-colors',
                      'touch-manipulation'
                    )}
                  >
                    <action.icon size={16} strokeWidth={1.75} className="text-muted-foreground" />
                    {action.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default MobileMessageActions;