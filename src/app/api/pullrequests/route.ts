import { NextResponse } from 'next/server';
import { getLatestPullRequests } from '@/utils/adoClient';

export async function GET() {
  try {
    const pullRequests = await getLatestPullRequests();
    return NextResponse.json(pullRequests);
  } catch (error) {
    console.error('Error in pull requests API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pull requests' },
      { status: 500 }
    );
  }
} 