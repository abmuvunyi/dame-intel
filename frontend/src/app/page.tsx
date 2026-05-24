'use client';
import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <GameBoard />
      </div>
    </div>
  );
}