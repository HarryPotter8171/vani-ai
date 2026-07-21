"use client";

import { useState } from "react";

export default function Home() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!message.trim()) return;

    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
        }),
      });

      const data = await res.json();

      setReply(data.reply);
    } catch (err) {
      setReply("Server Error");
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex">

      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 p-5">
        <h1 className="text-2xl font-bold text-violet-400">
          VANI AI
        </h1>

        <button className="w-full mt-6 bg-violet-600 rounded-lg py-3">
          + New Chat
        </button>

        <div className="mt-8 space-y-3">

          <button className="w-full bg-zinc-800 rounded-lg py-3">
            📈 Stock Analysis
          </button>

          <button className="w-full bg-zinc-800 rounded-lg py-3">
            📁 IPO Analysis
          </button>

          <button className="w-full bg-zinc-800 rounded-lg py-3">
            🔍 AI Research
          </button>

          <button className="w-full bg-zinc-800 rounded-lg py-3">
            ⚙️ Settings
          </button>

        </div>
      </aside>

      <section className="flex-1 flex flex-col">

        <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-8">

          <h2 className="text-xl font-semibold">
            Welcome to VANI AI
          </h2>

          <button className="bg-violet-600 px-5 py-2 rounded-lg">
            Upgrade
          </button>

        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-10">

          <h1 className="text-5xl font-bold text-violet-400">
            Wisdom Meets AI
          </h1>

          <p className="mt-4 text-zinc-400">
            Your Intelligent Trading Assistant
          </p><input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-10 w-full max-w-3xl rounded-xl bg-zinc-900 border border-zinc-700 p-5 outline-none"
            placeholder="Ask anything..."
          />

          <button
            onClick={handleSend}
            className="mt-5 bg-violet-600 px-8 py-3 rounded-xl hover:bg-violet-700"
          >
            {loading ? "Loading..." : "Send"}
          </button>

          {reply && (
            <div className="mt-10 w-full max-w-3xl rounded-xl bg-zinc-900 border border-zinc-700 p-6">

              <h2 className="text-violet-400 font-bold mb-3">
                VANI AI
              </h2>

              <p className="whitespace-pre-wrap">
                {reply}
              </p>

            </div>
          )}</div>
      </section>
    </main>
  );
}