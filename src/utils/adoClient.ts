import * as azdev from 'azure-devops-node-api';
import { GitPullRequest, PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';

export interface PullRequestDetails {
  pullRequestId: number;
  title: string;
  description: string;
  status: PullRequestStatus;
  createdBy: string;
  creationDate: Date;
  repository: string;
  sourceRef: string;
  targetRef: string;
  url: string;
}

export async function getAdoClient() {
  try {
    const orgUrl = `https://dev.azure.com/${process.env.ADO_ORGANIZATION}`;
    const token = process.env.ADO_PAT;

    console.debug('ADO Configuration:', {
      organization: process.env.ADO_ORGANIZATION,
      project: process.env.ADO_PROJECT,
      hasToken: !!token,
      url: orgUrl
    });

    if (!token) {
      throw new Error('ADO Personal Access Token is not configured');
    }

    const authHandler = azdev.getPersonalAccessTokenHandler(token);
    const client = new azdev.WebApi(orgUrl, authHandler);
    
    // Test the connection
    const connData = await client.connect();
    console.debug('ADO Connection successful:', {
      user: connData.authenticatedUser?.providerDisplayName
    });
    
    return client;
  } catch (error) {
    console.error('Error initializing ADO client:', error);
    throw error;
  }
}

export async function getLatestPullRequests(count: number = 5): Promise<PullRequestDetails[]> {
  try {
    console.debug('Fetching pull requests with count:', count);

    const client = await getAdoClient();
    const gitApi = await client.getGitApi();
    const project = process.env.ADO_PROJECT;
    const repositoryId = '1b255d6e-1545-42ab-9e75-1fb3f0202dfa';

    if (!project) {
      throw new Error('ADO Project is not configured');
    }

    console.debug('Fetching pull requests for repository:', repositoryId);

    const pullRequests = await gitApi.getPullRequests(
      repositoryId,
      {
        status: PullRequestStatus.All,
        targetRefName: 'refs/heads/main',
        repositoryId: repositoryId,
      },
      project,
      count,
      0
    );

    console.debug('Retrieved pull requests:', {
      count: pullRequests.length,
      requests: pullRequests.map(pr => ({
        id: pr.pullRequestId,
        title: pr.title,
        status: pr.status,
        createdBy: pr.createdBy?.displayName
      }))
    });

    return pullRequests
      .map((pr: GitPullRequest) => ({
        pullRequestId: pr.pullRequestId || 0,
        title: pr.title || 'Untitled Pull Request',
        description: pr.description || '',
        status: pr.status || PullRequestStatus.NotSet,
        createdBy: pr.createdBy?.displayName || 'Unknown',
        creationDate: new Date(pr.creationDate || Date.now()),
        repository: pr.repository?.name || 'Unknown',
        sourceRef: pr.sourceRefName || '',
        targetRef: pr.targetRefName || '',
        url: pr._links?.web?.href || '',
      }));
  } catch (error) {
    console.error('Error in getLatestPullRequests:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    throw error;
  }
} 