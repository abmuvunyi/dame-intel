'use client';
import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const endpoint = isRegistering ? '/auth/register' : '/auth/login';
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${endpoint}`, { username, password });

      if (res.data.access_token) {
        localStorage.setItem('token', res.data.access_token);
        router.push('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed');
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#262421] border border-[#3c3a38] rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-white">
          {isRegistering ? 'Create Account' : 'Welcome Back'}
        </h1>

        {error && <p className="text-[#b64b1f] text-center mb-4 font-bold">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-[#c3c3c2]">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 block w-full rounded border-[#3c3a38] shadow-sm p-2 border bg-[#302e2b] text-white focus:outline-none focus:border-[#858482]"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-[#c3c3c2]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded border-[#3c3a38] shadow-sm p-2 border bg-[#302e2b] text-white focus:outline-none focus:border-[#858482]"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-[#739552] text-white font-bold rounded hover:bg-[#81a55d] transition shadow-md"
          >
            {isRegistering ? 'Register' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[#c3c3c2]">
          {isRegistering ? "Already have an account? " : "Don't have an account? "}
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-[#ebecd0] font-bold hover:underline"
          >
            {isRegistering ? 'Sign In' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}