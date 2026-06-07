'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center py-10 px-4 bg-[#302e2b]">
      <div className="w-full max-w-6xl">
        <GameBoard />
      </div>
    </main>
  );
}