'use client';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ClubDetail() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [club, setClub] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [postContent, setPostContent] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const fetchAll = async () => {
    try {
      const [clubRes, membersRes] = await Promise.all([
        axios.get(`${API}/clubs/${id}`),
        axios.get(`${API}/clubs/${id}/members`),
      ]);
      setClub(clubRes.data);
      setMembers(membersRes.data);

      if (token) {
        // My user id isn't directly known here without /auth/profile — simplest
        // reliable signal for "am I a member" is just whether the members-only feed
        // endpoint lets us in at all.
        try {
          const feedRes = await axios.get(`${API}/clubs/${id}/posts`, { headers: authHeaders });
          setFeed(feedRes.data);
          setIsMember(true);
          setFeedError('');
        } catch {
          setIsMember(false);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) fetchAll(); }, [id]);

  const handleJoin = async () => {
    if (!token) { router.push('/login'); return; }
    try {
      await axios.post(`${API}/clubs/${id}/join`, {}, { headers: authHeaders });
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to join');
    }
  };

  const handleLeave = async () => {
    if (!token) return;
    if (!confirm('Leave this club?')) return;
    try {
      await axios.post(`${API}/clubs/${id}/leave`, {}, { headers: authHeaders });
      setIsMember(false);
      setFeed([]);
      fetchAll();
    } catch (err: any) {
      alert('Failed to leave club');
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !postContent.trim()) return;
    try {
      await axios.post(`${API}/clubs/${id}/posts`, { content: postContent }, { headers: authHeaders });
      setPostContent('');
      fetchAll();
    } catch (err: any) {
      setFeedError(err.response?.data?.message || 'Failed to post');
    }
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;
  if (!club) return <div className="p-10 text-center text-red-500">Club not found</div>;

  return (
    <div className="flex-1 w-full flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-4xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">{club.name}</h1>
          {club.description && <p className="text-[#c3c3c2] mt-2">{club.description}</p>}
          <p className="text-[#858482] text-sm mt-1">{club.memberCount} member{club.memberCount === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button onClick={() => router.push('/clubs')} className="px-4 py-2 text-[#c3c3c2] hover:text-white border border-[#3c3a38] rounded bg-[#3c3a38] font-bold shadow-sm transition">
            Back
          </button>
          {isMember ? (
            <button onClick={handleLeave} className="px-6 py-2 bg-[#302e2b] text-[#c3c3c2] font-bold rounded border border-[#3c3a38] shadow transition">
              Leave Club
            </button>
          ) : (
            <button onClick={handleJoin} className="px-6 py-2 bg-[#739552] text-white font-bold rounded shadow-md hover:bg-[#81a55d] transition">
              Join Club
            </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-[#262421] border border-[#3c3a38] rounded-lg shadow-xl p-6">
          <h2 className="text-xl font-bold mb-4 text-white">Discussion</h2>

          {isMember ? (
            <>
              <form onSubmit={handlePost} className="mb-6 flex flex-col gap-2">
                {feedError && <p className="text-red-600 text-sm">{feedError}</p>}
                <textarea
                  value={postContent}
                  onChange={e => setPostContent(e.target.value)}
                  placeholder="Share something with the club..."
                  className="border border-[#3c3a38] bg-[#302e2b] text-white p-2 rounded text-sm focus:outline-none focus:border-[#858482]"
                  rows={2}
                />
                <button type="submit" className="self-start px-4 py-1.5 bg-[#739552] text-white rounded font-bold text-sm hover:bg-[#81a55d] transition">Post</button>
              </form>

              {feed.length === 0 ? (
                <p className="text-[#858482] text-sm">No posts yet. Say something!</p>
              ) : (
                <ul className="space-y-4">
                  {feed.map((post) => (
                    <li key={post.id} className="border-b border-[#3c3a38] pb-3">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-white">{post.author?.username ?? 'Unknown'}</span>
                        <span className="text-xs text-[#858482]">{new Date(post.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-[#c3c3c2] text-sm mt-1 whitespace-pre-wrap">{post.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[#c3c3c2] text-sm">Join this club to see and post in its discussion feed.</p>
          )}
        </div>

        <div className="bg-[#262421] border border-[#3c3a38] rounded-lg shadow-xl p-6">
          <h2 className="text-xl font-bold mb-4 text-white">Members</h2>
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className="text-sm text-[#c3c3c2]">{m.username}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
