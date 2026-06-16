'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="h-full w-full flex flex-col items-center justify-center p-4 bg-[#302e2b]">
      <GameBoard />
    </main>
  );
}