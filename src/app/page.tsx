'use client';

import { useEffect, useState } from 'react';
import { PullRequestDetails } from '@/utils/adoClient';

export default function Home() {
  const [pullRequests, setPullRequests] = useState<PullRequestDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPullRequests = async () => {
      try {
        const response = await fetch('/api/pullrequests');
        if (!response.ok) {
          throw new Error('Failed to fetch pull requests');
        }
        const data = await response.json();
        setPullRequests(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPullRequests();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <div className="text-center">Loading pull requests...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-8">
        <div className="text-center text-red-500">Error: {error}</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold mb-8">Latest Pull Requests</h1>
      <div className="space-y-4">
        {pullRequests.map((pr) => (
          <div
            key={pr.pullRequestId}
            className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold mb-2">{pr.title}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p><span className="font-medium">ID:</span> {pr.pullRequestId}</p>
                <p><span className="font-medium">Status:</span> {pr.status}</p>
                <p><span className="font-medium">Created by:</span> {pr.createdBy}</p>
              </div>
              <div>
                <p><span className="font-medium">Repository:</span> {pr.repository}</p>
                <p><span className="font-medium">Created:</span> {new Date(pr.creationDate).toLocaleDateString()}</p>
              </div>
            </div>
            {pr.description && (
              <p className="mt-2 text-gray-600">{pr.description}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
