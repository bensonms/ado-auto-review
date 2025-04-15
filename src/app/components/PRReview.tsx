'use client';

import { useState } from 'react';
import type { CodeReviewResult } from '@/utils/adoClient';

export default function PRReview() {
  const [prId, setPrId] = useState('');
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<CodeReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReview = async () => {
    if (!prId) {
      setError('Please enter a PR ID');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/review?prId=${prId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to review PR');
      }
      
      setReview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review PR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-4 bg-white rounded-lg shadow">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">PR Review</h2>
        <div className="flex gap-2">
          <input
            type="number"
            value={prId}
            onChange={(e) => setPrId(e.target.value)}
            placeholder="Enter PR ID"
            className="px-4 py-2 border rounded-md flex-grow"
          />
          <button
            onClick={handleReview}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? 'Reviewing...' : 'Review PR'}
          </button>
        </div>
        {error && (
          <p className="text-red-600">{error}</p>
        )}
      </div>

      {review && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">{review.summary}</h3>
          
          <div className="space-y-2">
            <h4 className="font-medium">Statistics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(review.statistics).map(([key, value]) => (
                <div key={key} className="bg-gray-50 p-3 rounded">
                  <p className="text-sm text-gray-600">{key}</p>
                  <p className="text-lg font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Best Practices</h4>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(review.bestPractices).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={value ? 'text-green-500' : 'text-red-500'}>
                    {value ? '✓' : '✗'}
                  </span>
                  <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                </div>
              ))}
            </div>
          </div>

          {review.suggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Suggestions</h4>
              <div className="space-y-2">
                {review.suggestions.map((suggestion, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded">
                    <div className="flex items-start gap-2">
                      <span className={`
                        px-2 py-1 text-xs rounded
                        ${suggestion.severity === 'high' ? 'bg-red-100 text-red-800' :
                          suggestion.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'}
                      `}>
                        {suggestion.severity}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{suggestion.file}</p>
                        <p className="text-sm">{suggestion.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 