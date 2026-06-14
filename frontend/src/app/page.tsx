'use client';
import GameBoard from "@/components/game/GameBoard";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  return (
    <div className="w-full h-full flex items-center justify-center pt-10">
      <div className="w-full max-w-6xl">
        <GameBoard />
      </div>
    </div>
  );
}