"use client";

import React, { useState, useRef, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ChatInput from "@/components/ChatInput";
import Message, { MessageProps } from "@/components/Message";

export default function ChatPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [messages, setMessages] = useState<MessageProps[]>([
    {
      id: "welcome-message",
      role: "assistant",
      content: "Hello! I am VANI AI. How can I assist you today?",
    }
  ]);

  // Placeholder for sidebar chat history (You can wire this to your backend later)
  const [chats] = useState([
    { id: '1', title: 'React Server Components' },
    { id: '2', title: 'Tailwind CSS Grid Layout' }
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
   console.log("SEND CLICKED", content); // 1. Immediately inject the user's message into the UI
    const userMsg: MessageProps = {
      id: Date.now().toString(),
      role: "user",
      content,
    };
    
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // 2. Call your Express backend 
      // Update this URL/port to exactly match your Express server's address
     const response = await fetch("https://vani-ai-production-92e3.up.railway.app/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
 body: JSON.stringify({
  messages: [
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user",
      content,
    },
  ],
}),
});

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();console.log("Backend Response:", data);

      // 3. Append Assistant response from Express/Groq
      const assistantMsg: MessageProps = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        // Extracting data gracefully, adjust property based on your Express JSON design
        content: data.reply || data.message || data.content || "Sorry, I received an empty response from the server.",
      };
      
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Error communicating with Express backend:", error);
      
      const errorMsg: MessageProps = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I encountered an error connecting to the server. Please ensure the Express backend is running and the URL is correct.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: "assistant",
        content: "Hello! I am VANI AI. Let's start a new conversation. What's on your mind?",
      }
    ]);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#F9F9F9] text-gray-900 font-sans overflow-hidden">
      {/* Sidebar Component */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        chats={chats}
        onNewChat={handleNewChat}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#F9F9F9]">
        <Header onMenuClick={() => setIsSidebarOpen(true)} />

        {/* Scrollable Messages Display */}
        <main className="flex-1 overflow-y-auto w-full scroll-smooth">
          <div className="w-full flex flex-col pb-4 pt-6">
            {messages.map((msg) => (
              <Message 
                key={msg.id} 
                id={msg.id}
                role={msg.role} 
                content={msg.content} 
              />
            ))}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        </main>

        {/* Fixed Chat Input */}
        <div className="w-full z-10 bg-[#F9F9F9]">
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}