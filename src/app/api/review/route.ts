import { NextRequest, NextResponse } from 'next/server';
import { reviewPullRequest } from '@/utils/adoClient';

export async function GET(request: NextRequest) {
  try {
    // Get PR ID from query parameters if provided
    const searchParams = request.nextUrl.searchParams;
    const prId = searchParams.get('prId');
    
    // Convert prId to number if provided, otherwise pass undefined
    const pullRequestId = prId ? parseInt(prId, 10) : undefined;
    
    // Validate PR ID if provided
    if (prId && isNaN(pullRequestId!)) {
      return NextResponse.json(
        { error: 'Invalid pull request ID' },
        { status: 400 }
      );
    }

    const review = await reviewPullRequest(pullRequestId);
    return NextResponse.json(review);
  } catch (error) {
    console.error('Error in review API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to review pull request' },
      { status: 500 }
    );
  }
} 