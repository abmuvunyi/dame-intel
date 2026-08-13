'use client';
import { useState } from 'react';

export default function PlayDashboard({ onPlay }: { onPlay: (options: any) => void }) {
  const [boardSize, setBoardSize] = useState(8);
  const [timeControl, setTimeControl] = useState('blitz');

  return (
    <div className="w-full max-w-md mx-auto bg-[#262421] rounded text-white overflow-hidden shadow-lg border border-[#3a3835]">
      <div className="p-4 border-b border-[#3a3835]">
        <h2 className="text-xl font-bold text-center">Play Draughts</h2>
      </div>
      <div className="p-4 space-y-4">
         <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setBoardSize(8)}
              className={`p-3 text-sm rounded transition-colors ${boardSize === 8 ? 'bg-[#312e2b] border border-[#81b64c]' : 'bg-[#1b1918] border border-transparent hover:bg-[#312e2b]'}`}
            >
              8x8 (Standard)
            </button>
            <button
              onClick={() => setBoardSize(10)}
              className={`p-3 text-sm rounded transition-colors ${boardSize === 10 ? 'bg-[#312e2b] border border-[#81b64c]' : 'bg-[#1b1918] border border-transparent hover:bg-[#312e2b]'}`}
            >
              10x10 (International)
            </button>
         </div>

         <div className="grid grid-cols-4 gap-2 mt-4">
            {['bullet', 'blitz', 'rapid', 'correspondence'].map(tc => (
               <button
                 key={tc}
                 onClick={() => setTimeControl(tc)}
                 className={`p-2 text-xs rounded transition-colors ${timeControl === tc ? 'bg-[#312e2b] border border-[#81b64c]' : 'bg-[#1b1918] border border-transparent hover:bg-[#312e2b]'}`}
               >
                 {tc}
               </button>
            ))}
         </div>

         <button
           onClick={() => onPlay({ boardSize, timeControl, forceMajorityCapture: boardSize === 10 })}
           className="w-full py-4 mt-6 bg-[#81b64c] hover:bg-[#a3d160] text-white font-bold rounded shadow-lg text-lg transition-colors"
         >
           Play
         </button>

         <div className="text-center mt-2 pb-2">
           <span className="text-xs text-[#989795]">Match with opponents of your skill level</span>
         </div>
      </div>
    </div>
  );
}
