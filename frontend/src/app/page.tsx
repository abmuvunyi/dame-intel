'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#302e2b] flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl">
        <GameBoard />
      </div>
    </main>
  );
}