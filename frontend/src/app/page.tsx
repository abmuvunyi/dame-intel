'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="flex-1 w-full bg-[#302e2b] text-[#c3c3c2] flex justify-center py-6 px-4">
      <div className="w-full max-w-[1200px]">
        <GameBoard />
      </div>
    </main>
  );
}
