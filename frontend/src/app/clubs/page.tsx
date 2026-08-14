'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ClubsList() {
  const [clubs, setClubs] = useState<any[]>([]);
  const [myClubIds, setMyClubIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchClubs = async () => {
    try {
      const res = await axios.get(`${API}/clubs`);
      setClubs(res.data);

      if (token) {
        try {
          const mine = await axios.get(`${API}/clubs/mine`, { headers: { Authorization: `Bearer ${token}` } });
          setMyClubIds(new Set(mine.data.map((c: any) => c.id)));
        } catch { /* not logged in / token expired — just show clubs without membership highlighting */ }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClubs(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) { router.push('/login'); return; }
    try {
      const res = await axios.post(`${API}/clubs`, { name, description }, { headers: { Authorization: `Bearer ${token}` } });
      setName(''); setDescription(''); setShowCreate(false);
      fetchClubs();
      router.push(`/clubs/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create club');
    }
  };

  const handleJoin = async (clubId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) { router.push('/login'); return; }
    try {
      await axios.post(`${API}/clubs/${clubId}/join`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchClubs();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to join club');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex flex-col items-center">
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800">Clubs</h1>
        <div className="flex gap-3">
          <button onClick={() => setShowCreate(s => !s)} className="px-4 py-2 bg-green-600 text-white font-medium rounded hover:bg-green-700 shadow transition">
            {showCreate ? 'Cancel' : 'Create Club'}
          </button>
          <button onClick={() => router.push('/')} className="text-blue-600 hover:underline px-2">Back to Dashboard</button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-6 mb-6 flex flex-col gap-3">
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <input
            type="text" placeholder="Club name" value={name} onChange={e => setName(e.target.value)}
            className="border p-2 rounded" required
          />
          <textarea
            placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)}
            className="border p-2 rounded" rows={2}
          />
          <button type="submit" className="self-start px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
        </form>
      )}

      <div className="w-full max-w-4xl bg-white rounded-lg shadow-xl p-8">
        {loading ? (
          <p>Loading...</p>
        ) : clubs.length === 0 ? (
          <p className="text-gray-500">No clubs yet. Be the first to create one!</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {clubs.map((c) => (
              <li
                key={c.id}
                className="py-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 px-2 rounded"
                onClick={() => router.push(`/clubs/${c.id}`)}
              >
                <div>
                  <h3 className="text-xl font-bold text-blue-800">{c.name}</h3>
                  {c.description && <p className="text-gray-600 text-sm mt-1">{c.description}</p>}
                  <p className="text-gray-400 text-xs mt-1">{c.memberCount} member{c.memberCount === 1 ? '' : 's'}</p>
                </div>
                {myClubIds.has(c.id) ? (
                  <span className="px-4 py-2 text-green-700 bg-green-50 border border-green-200 rounded text-sm font-medium">Member</span>
                ) : (
                  <button
                    onClick={(e) => handleJoin(c.id, e)}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 shadow transition"
                  >
                    Join
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
