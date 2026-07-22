import React from 'react';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center w-full h-14 px-4 bg-[#F9F9F9]/80 backdrop-blur-xl border-b border-gray-200/60">
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 -ml-2 mr-2 text-gray-600 hover:bg-gray-200/50 rounded-lg transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex-1 flex justify-center md:justify-start items-center">
        <span className="font-semibold tracking-tight text-gray-900 text-lg">VANI AI</span>
        <span className="ml-3 px-2 py-0.5 rounded-full bg-black/5 text-gray-600 text-[11px] font-bold uppercase tracking-wider">
          Groq Powered
        </span>
      </div>
    </header>
  );
}