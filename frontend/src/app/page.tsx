'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="w-full h-full flex flex-col p-8 bg-[#302e2b]">
      <div className="w-full flex justify-center h-full">
        <GameBoard />
      </div>
    </main>
  );
}
