import { NextResponse } from 'next/server';
import { reviewPullRequest, getLatestPullRequests } from '@/utils/adoClient';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prId = searchParams.get('prId');

  if (!prId) {
    return NextResponse.json({ error: 'PR ID is required' }, { status: 400 });
  }

  try {
    // First, get the PR details
    const prDetails = await getLatestPullRequests(parseInt(prId));
    
    if (!prDetails) {
      return NextResponse.json({ error: 'Pull request not found' }, { status: 404 });
    }

    const review = await reviewPullRequest(parseInt(prId));
    return NextResponse.json(review);
  } catch (error) {
    console.error('Error reviewing PR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review PR' },
      { status: 500 }
    );
  }
} 