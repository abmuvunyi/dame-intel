'use client';
import GameBoard from "@/components/game/GameBoard";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl flex justify-between items-center mb-6">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400 tracking-tight">
          Play Draughts
        </h1>
      </div>

      <div className="w-full max-w-5xl">
        <div className="p-8">
          <GameBoard />
        </div>
      </div>
    </div>
  );
}