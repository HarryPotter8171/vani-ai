import React from 'react';

export interface MessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function Message({ role, content }: MessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} px-4 py-4 md:py-6 group`}>
      <div className={`flex max-w-3xl w-full ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-4 md:gap-5`}>
        
        {/* Avatar */}
        <div className="flex-shrink-0 flex items-start justify-center mt-1">
          {isUser ? (
            <div className="w-8 h-8 rounded-full bg-blue-600 shadow-sm flex items-center justify-center text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-black shadow-sm flex items-center justify-center text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}
        </div>

        {/* Content Box */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[75%]`}>
          <div className="text-[13px] font-medium text-gray-500 mb-1.5 px-1">
            {isUser ? 'You' : 'VANI AI'}
          </div>
          <div 
            className={`px-5 py-3.5 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap break-words ${
              isUser 
                ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm' 
                : 'bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-sm shadow-[0_2px_10px_rgba(0,0,0,0.02)]'
            }`}
          >
            {content}
          </div>
        </div>

      </div>
    </div>
  );
}