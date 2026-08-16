'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="h-full flex flex-col md:flex-row p-4 md:p-8 overflow-y-auto">
      <div className="w-full flex-1 max-w-[1200px] mx-auto">
        <GameBoard />
      </div>
    </main>
  );
}
