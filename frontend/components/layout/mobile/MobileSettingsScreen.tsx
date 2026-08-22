'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Save, Sparkles, Palette, Bot, Brain, User, Info, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';

export type MobileSettingsSection = 'general' | 'appearance' | 'ai' | 'memory' | 'profile' | 'about';

export interface MobileSettingsScreenProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: MobileSettingsSection;
  // General settings
  theme?: 'light' | 'dark' | 'auto';
  onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
  // Appearance settings
  density?: 'comfortable' | 'compact';
  onDensityChange?: (density: 'comfortable' | 'compact') => void;
  // AI settings
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  // Profile settings
  userName?: string;
  userEmail?: string;
  onSave?: () => void;
}

const SECTIONS: { id: MobileSettingsSection; label: string; icon: any }[] = [
  { id: 'general', label: 'General', icon: Sparkles },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'about', label: 'About', icon: Info },
];

/**
 * MobileSettingsScreen - Full-screen mobile settings
 * 
 * Features:
 * - Full-screen modal experience
 * - Bottom sheet or page-style navigation
 * - Safe area support
 * - Touch-friendly controls
 * - Section-based navigation
 */
function MobileSettingsScreen({
  isOpen,
  onClose,
  initialSection = 'general',
  theme = 'auto',
  onThemeChange,
  density = 'comfortable',
  onDensityChange,
  selectedModel = 'auto',
  onModelChange,
  userName,
  userEmail,
  onSave,
}: MobileSettingsScreenProps) {
  const [activeSection, setActiveSection] = useState<MobileSettingsSection>(initialSection);
  const [showNav, setShowNav] = useState(true);

  const handleSectionChange = (section: MobileSettingsSection) => {
    setActiveSection(section);
    setShowNav(false);
  };

  const handleBack = () => {
    setShowNav(true);
    setActiveSection(initialSection);
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Theme</h3>
              <div className="flex gap-2">
                {(['light', 'dark', 'auto'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onThemeChange?.(t)}
                    className={cn(
                      'flex-1 rounded-xl px-4 py-3 text-sm font-medium',
                      'transition-colors',
                      'touch-manipulation',
                      theme === t
                        ? 'bg-accent text-text-on-accent'
                        : 'bg-surface-input text-foreground hover:bg-surface-hover'
                    )}
                  >
                    {t === 'light' && <Sun className="mx-auto mb-1" size={20} />}
                    {t === 'dark' && <Moon className="mx-auto mb-1" size={20} />}
                    {t === 'auto' && <span className="mx-auto mb-1 block text-xl">🌗</span>}
                    <span className="capitalize">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Density</h3>
              <div className="flex gap-2">
                {(['comfortable', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDensityChange?.(d)}
                    className={cn(
                      'flex-1 rounded-xl px-4 py-3 text-sm font-medium',
                      'transition-colors',
                      'touch-manipulation',
                      density === d
                        ? 'bg-accent text-text-on-accent'
                        : 'bg-surface-input text-foreground hover:bg-surface-hover'
                    )}
                  >
                    <span className="capitalize">{d}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Model</h3>
              <select
                value={selectedModel}
                onChange={(e) => onModelChange?.(e.target.value)}
                className={cn(
                  'w-full rounded-xl px-4 py-3',
                  'bg-surface-input',
                  'border border-border/70',
                  'text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-accent/50',
                  'transition-all'
                )}
              >
                <option value="auto">Auto</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5">GPT-3.5</option>
                <option value="claude-3">Claude 3</option>
              </select>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Name</h3>
              <input
                type="text"
                defaultValue={userName}
                placeholder="Your name"
                className={cn(
                  'w-full rounded-xl px-4 py-3',
                  'bg-surface-input',
                  'border border-border/70',
                  'text-foreground',
                  'placeholder:text-muted-foreground/50',
                  'focus:outline-none focus:ring-2 focus:ring-accent/50',
                  'transition-all'
                )}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Email</h3>
              <input
                type="email"
                defaultValue={userEmail}
                placeholder="your@email.com"
                className={cn(
                  'w-full rounded-xl px-4 py-3',
                  'bg-surface-input',
                  'border border-border/70',
                  'text-foreground',
                  'placeholder:text-muted-foreground/50',
                  'focus:outline-none focus:ring-2 focus:ring-accent/50',
                  'transition-all'
                )}
              />
            </div>
          </div>
        );

      case 'memory':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Memory settings allow VANI to remember information across conversations.
            </p>
            <div className="rounded-xl bg-surface-input p-4">
              <p className="text-sm text-muted-foreground">
                Memory management features coming soon.
              </p>
            </div>
          </div>
        );

      case 'about':
        return (
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold">VANI AI</h2>
              <p className="text-sm text-muted-foreground">Version 2.0</p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>VANI is your AI assistant for research, coding, and creative work.</p>
              <p>Built with modern AI technologies to help you work smarter.</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-4">
            <button
              type="button"
              onClick={showNav ? onClose : handleBack}
              className={cn(
                'flex items-center justify-center',
                'h-11 w-11',
                'rounded-full',
                'bg-surface-input',
                'text-foreground',
                'transition-colors',
                'hover:bg-surface-hover',
                'active:scale-95',
                'touch-manipulation'
              )}
              aria-label={showNav ? 'Close settings' : 'Back to sections'}
            >
              {showNav ? <X size={20} strokeWidth={1.75} /> : <ArrowLeft size={20} strokeWidth={1.75} />}
            </button>
            <h1 className="text-lg font-semibold tracking-[-0.02em]">
              {showNav ? 'Settings' : SECTIONS.find(s => s.id === activeSection)?.label}
            </h1>
            <div className="h-11 w-11" /> {/* Spacer for center alignment */}
          </div>

          {!showNav && (
            <div className="flex overflow-x-auto border-b border-border/50 p-2 gap-2 custom-scrollbar">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap',
                    'transition-colors',
                    activeSection === section.id
                      ? 'bg-accent text-text-on-accent'
                      : 'bg-surface-input text-muted-foreground hover:bg-surface-hover'
                  )}
                >
                  {section.label}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
            <AnimatePresence mode="wait">
              {showNav ? (
                <motion.div
                  key="nav"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={SPRING.snappy}
                  className="space-y-2"
                >
                  {SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => handleSectionChange(section.id)}
                      className={cn(
                        'flex w-full items-center gap-3',
                        'rounded-xl px-4 py-3.5',
                        'text-left',
                        'transition-colors',
                        'touch-manipulation',
                        'bg-surface-input',
                        'hover:bg-surface-hover'
                      )}
                    >
                      <section.icon size={20} strokeWidth={1.75} className="text-muted-foreground" />
                      <span className="font-medium">{section.label}</span>
                    </button>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="section"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={SPRING.snappy}
                >
                  {renderSectionContent()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Save Button (for profile section) */}
          {activeSection === 'profile' && !showNav && onSave && (
            <div className="border-t border-border/50 p-4">
              <button
                type="button"
                onClick={onSave}
                className={cn(
                  'flex w-full items-center justify-center gap-2',
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
                <Save size={18} strokeWidth={1.75} />
                Save Changes
              </button>
            </div>
          )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MobileSettingsScreen;