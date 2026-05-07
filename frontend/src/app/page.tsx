'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-7xl flex flex-col items-center">
        <GameBoard />
      </div>
    </main>
  );
}