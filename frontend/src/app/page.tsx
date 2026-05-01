'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#302e2b] flex items-center justify-center p-8">
      <div className="w-full h-full flex items-center justify-center">
        <GameBoard />
      </div>
    </main>
  );
}
