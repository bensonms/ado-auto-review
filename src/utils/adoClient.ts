import * as azdev from 'azure-devops-node-api';

export interface PullRequestDetails {
  pullRequestId: number;
  title: string;
  description: string;
  status: string;
  createdBy: string;
  creationDate: Date;
  repository: string;
}

export async function getAdoClient() {
  const orgUrl = `https://dev.azure.com/${process.env.ADO_ORGANIZATION}`;
  const token = process.env.ADO_PAT;

  if (!token) {
    throw new Error('ADO Personal Access Token is not configured');
  }

  const authHandler = azdev.getPersonalAccessTokenHandler(token);
  return new azdev.WebApi(orgUrl, authHandler);
}

export async function getLatestPullRequests(count: number = 5): Promise<PullRequestDetails[]> {
  try {
    const client = await getAdoClient();
    const gitApi = await client.getGitApi();
    const project = process.env.ADO_PROJECT;

    if (!project) {
      throw new Error('ADO Project is not configured');
    }

    const pullRequests = await gitApi.getPullRequests(
      project,
      {
        status: 'all',
      },
      project
    );

    return pullRequests
      .slice(0, count)
      .map((pr) => ({
        pullRequestId: pr.pullRequestId,
        title: pr.title,
        description: pr.description || '',
        status: pr.status,
        createdBy: pr.createdBy?.displayName || 'Unknown',
        creationDate: new Date(pr.creationDate),
        repository: pr.repository?.name || 'Unknown',
      }));
  } catch (error) {
    console.error('Error fetching pull requests:', error);
    throw error;
  }
} 