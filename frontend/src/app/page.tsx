'use client';
import GameBoard from "@/components/game/GameBoard";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  return (
    <main className="min-h-screen w-full flex justify-center items-start pt-10 px-4 bg-[#302e2b]">
      <div className="w-full max-w-[1200px]">
        <GameBoard />
      </div>
    </main>
  );
}