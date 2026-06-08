'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8 flex justify-center items-start">
      <div className="w-full max-w-6xl">
        <GameBoard />
      </div>
    </main>
  );
}
