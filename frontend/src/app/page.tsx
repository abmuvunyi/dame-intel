import GameBoard from "@/components/game/GameBoard";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-6">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-8 tracking-tight">
          Online Draughts
        </h1>
        <GameBoard />
      </div>
    </main>
  );
}