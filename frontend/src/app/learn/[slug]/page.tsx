'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import DashboardShell from '@/components/DashboardShell';
import Board from '@/components/game/Board';
import { BoardState } from '@/lib/draughts';
import { API_BASE } from '@/lib/api';


interface LessonDetail {
  slug: string;
  title: string;
  category: 'opening' | 'middlegame' | 'endgame' | 'tactics';
  difficulty: number;
  summary: string;
  body: string[];
  exampleBoard: BoardState | null;
  exampleBoardSize: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
  tactics: 'Tactics',
};

export default function LessonDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    axios.get<LessonDetail>(`${API_BASE}/lessons/${slug}`)
      .then(res => setLesson(res.data))
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <DashboardShell>
        <div className="min-h-screen py-8 px-6">
          <p className="text-slate-400">Lesson not found.</p>
          <button onClick={() => router.push('/learn')} className="text-green-400 hover:underline mt-4">
            ← Back to Learn
          </button>
        </div>
      </DashboardShell>
    );
  }

  if (!lesson) {
    return (
      <DashboardShell>
        <div className="min-h-screen py-8 px-6 text-slate-500">Loading lesson...</div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="min-h-screen py-8 px-6">
        <button onClick={() => router.push('/learn')} className="text-green-400 hover:underline text-sm mb-4">
          ← Back to Learn
        </button>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
            {CATEGORY_LABEL[lesson.category]}
          </span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-100 mb-6">{lesson.title}</h1>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="flex-1 flex flex-col gap-4 max-w-2xl">
            {lesson.body.map((paragraph, i) => (
              <p key={i} className="text-slate-300 leading-relaxed">{paragraph}</p>
            ))}
          </div>

          {lesson.exampleBoard && (
            <div className="bg-white rounded-xl shadow-2xl p-6 border border-slate-800">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 text-center">Example position</p>
              {/* Read-only diagram: myColor=null puts Board.tsx in spectator mode, the
                  exact same "no moves accepted" mode it already uses for watching a
                  live game — reused here rather than building a second board
                  renderer just to show a static position. */}
              <Board
                board={lesson.exampleBoard}
                myColor={null}
                currentTurn={null}
                legalMoves={[]}
                lastMove={null}
                flipped={false}
                onMove={() => {}}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
