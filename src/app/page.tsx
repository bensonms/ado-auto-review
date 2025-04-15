'use client';

import { useEffect, useState } from 'react';
import type { PullRequestDetails, CodeReviewResult } from '@/utils/adoClient';
import PRReview from './components/PRReview';

export default function Home() {
  const [pullRequest, setPullRequest] = useState<PullRequestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<CodeReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [activeTab, setActiveTab] = useState<'latest' | 'custom'>('latest');

  useEffect(() => {
    const fetchPullRequest = async () => {
      try {
        const response = await fetch('/api/pullrequests');
        if (!response.ok) {
          throw new Error('Failed to fetch pull request');
        }
        const data = await response.json();
        setPullRequest(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchPullRequest();
  }, []);

  const handleReview = async () => {
    if (!pullRequest) return;
    
    try {
      setReviewing(true);
      const response = await fetch(`/api/review?prId=${pullRequest.pullRequestId}`);
      if (!response.ok) {
        throw new Error('Failed to review pull request');
      }
      const data = await response.json();
      setReview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review pull request');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('latest')}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === 'latest'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              Latest Pull Request
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === 'custom'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              Review by PR ID
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'latest' ? (
        <div className="space-y-8">
          {loading ? (
            <div className="text-center">Loading pull request...</div>
          ) : error ? (
            <div className="text-center text-red-500">Error: {error}</div>
          ) : !pullRequest ? (
            <div className="text-center">No pull requests found</div>
          ) : (
            <>
              <div className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-semibold">{pullRequest.title}</h2>
                  <button
                    onClick={handleReview}
                    disabled={reviewing}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed"
                  >
                    {reviewing ? 'Reviewing...' : 'Review PR'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><span className="font-medium">ID:</span> {pullRequest.pullRequestId}</p>
                    <p><span className="font-medium">Status:</span> {pullRequest.status}</p>
                    <p><span className="font-medium">Created by:</span> {pullRequest.createdBy}</p>
                  </div>
                  <div>
                    <p><span className="font-medium">Repository:</span> {pullRequest.repository}</p>
                    <p><span className="font-medium">Created:</span> {new Date(pullRequest.creationDate).toLocaleDateString()}</p>
                  </div>
                </div>
                {pullRequest.description && (
                  <p className="mt-2 text-gray-600">{pullRequest.description}</p>
                )}
              </div>

              {review && (
                <div className="border rounded-lg p-4 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">Code Review Results</h2>
                  
                  <div className="space-y-6">
                    {/* Statistics */}
                    <div>
                      <h3 className="text-lg font-medium mb-2">Changes</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-sm text-gray-600">Files Changed</p>
                          <p className="text-xl font-semibold">{review.statistics.filesChanged}</p>
                        </div>
                        <div className="bg-green-50 p-3 rounded">
                          <p className="text-sm text-gray-600">Additions</p>
                          <p className="text-xl font-semibold text-green-600">+{review.statistics.additions}</p>
                        </div>
                        <div className="bg-red-50 p-3 rounded">
                          <p className="text-sm text-gray-600">Deletions</p>
                          <p className="text-xl font-semibold text-red-600">-{review.statistics.deletions}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-sm text-gray-600">Total Changes</p>
                          <p className="text-xl font-semibold">{review.statistics.totalChanges}</p>
                        </div>
                      </div>
                    </div>

                    {/* Best Practices */}
                    <div>
                      <h3 className="text-lg font-medium mb-2">Best Practices</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(review.bestPractices).map(([key, value]) => (
                          <div key={key} className={`p-3 rounded ${value ? 'bg-green-50' : 'bg-yellow-50'}`}>
                            <p className="text-sm text-gray-600">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                            <p className={`text-lg font-semibold ${value ? 'text-green-600' : 'text-yellow-600'}`}>
                              {value ? '✓' : '⚠️'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Suggestions */}
                    {review.suggestions.length > 0 && (
                      <div>
                        <h3 className="text-lg font-medium mb-2">Suggestions</h3>
                        <div className="space-y-2">
                          {review.suggestions.map((suggestion, index) => (
                            <div
                              key={index}
                              className={`p-3 rounded ${
                                suggestion.severity === 'high'
                                  ? 'bg-red-50'
                                  : suggestion.severity === 'medium'
                                  ? 'bg-yellow-50'
                                  : 'bg-blue-50'
                              }`}
                            >
                              <p className="font-medium">{suggestion.file}</p>
                              <p className="text-sm mt-1">{suggestion.message}</p>
                              {suggestion.line && (
                                <p className="text-sm text-gray-600 mt-1">Line: {suggestion.line}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <PRReview />
      )}
    </main>
  );
}
