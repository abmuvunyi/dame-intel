'use client';

interface ConnectionStatusProps {
  connected: boolean;
}

export default function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      <span
        className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
      />
      <span className={connected ? 'text-green-700' : 'text-red-700'}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}
