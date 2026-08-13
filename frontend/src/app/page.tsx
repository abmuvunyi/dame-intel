'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="h-full bg-[#302e2b] flex justify-center pt-8 overflow-hidden">
      <div className="w-full max-w-[1200px] px-4 flex gap-6 h-full">
         <GameBoard />
      </div>
    </main>
  );
}
