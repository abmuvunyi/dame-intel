'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#302e2b] flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl bg-[#262421] rounded-xl shadow-2xl overflow-hidden border border-[#3c3a38]">
        <div className="p-8">
          <GameBoard />
        </div>
      </div>
    </main>
  );
}