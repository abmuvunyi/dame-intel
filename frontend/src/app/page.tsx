'use client';
import GameBoard from "@/components/game/GameBoard";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-6xl">
        <GameBoard />
      </div>
    </main>
  );
}