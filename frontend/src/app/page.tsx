'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <div className="w-full h-full flex justify-center items-start pt-8">
      <GameBoard />
    </div>
  );
}