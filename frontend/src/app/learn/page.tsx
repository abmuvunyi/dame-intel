'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import DashboardShell from '@/components/DashboardShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface LessonSummary {
  slug: string;
  title: string;
  category: 'opening' | 'middlegame' | 'endgame' | 'tactics';
  difficulty: number;
  summary: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
  tactics: 'Tactics',
};

// Same order every time regardless of what the backend happens to return first —
// mirrors how a real curriculum reads (openings before endgames), not database order.
const CATEGORY_ORDER = ['opening', 'middlegame', 'endgame', 'tactics'];

const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

export default function LearnPage() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const router = useRouter();

  useEffect(() => {
    axios.get<LessonSummary[]>(`${API_URL}/lessons`).then(res => setLessons(res.data)).catch(() => {});
  }, []);

  const grouped = CATEGORY_ORDER.map(category => ({
    category,
    lessons: lessons.filter(l => l.category === category),
  })).filter(g => g.lessons.length > 0);

  return (
    <DashboardShell>
      <div className="min-h-screen py-8 px-6">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 tracking-tight mb-2">
          Learn Draughts
        </h1>
        <p className="text-slate-400 mb-8">
          Real, curated lessons on opening principles, middlegame ideas, endgame technique, and tactics — free for everyone.
        </p>

        {lessons.length === 0 && (
          <p className="text-slate-500">Loading lessons...</p>
        )}

        <div className="flex flex-col gap-10">
          {grouped.map(group => (
            <section key={group.category}>
              <h2 className="text-xl font-bold text-slate-100 mb-4">{CATEGORY_LABEL[group.category]}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.lessons.map(lesson => (
                  <button
                    key={lesson.slug}
                    onClick={() => router.push(`/learn/${lesson.slug}`)}
                    className="text-left bg-slate-800 rounded-xl border border-slate-700 p-5 shadow-lg hover:border-green-600 transition flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-100">{lesson.title}</h3>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 shrink-0 ml-2">
                        {DIFFICULTY_LABEL[lesson.difficulty] ?? 'Beginner'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">{lesson.summary}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
