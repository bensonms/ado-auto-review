import * as azdev from 'azure-devops-node-api';
import { PullRequestStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';

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

export interface CodeReviewResult {
  summary: string;
  suggestions: Array<{
    file: string;
    line?: number;
    message: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  statistics: {
    filesChanged: number;
    additions: number;
    deletions: number;
    totalChanges: number;
  };
  bestPractices: {
    commitMessages: boolean;
    branchNaming: boolean;
    testCoverage: boolean;
    documentationUpdated: boolean;
  };
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
      user: connData.authenticatedUser?.providerDisplayName,
      userId: connData.authenticatedUser?.id
    });
    
    return { client, userId: connData.authenticatedUser?.id };
  } catch (error) {
    console.error('Error initializing ADO client:', error);
    throw error;
  }
}

export async function getLatestPullRequests(): Promise<PullRequestDetails | null> {
  try {
    console.debug('Fetching latest pull request');

    const { client, userId } = await getAdoClient();
    const gitApi = await client.getGitApi();
    const project = process.env.ADO_PROJECT;
    const repositoryId = '1b255d6e-1545-42ab-9e75-1fb3f0202dfa';

    if (!project) {
      throw new Error('ADO Project is not configured');
    }

    if (!userId) {
      throw new Error('Could not determine authenticated user ID');
    }

    // Let's try to get the repository first to verify access
    try {
      const repo = await gitApi.getRepository(repositoryId, project);
      console.debug('Successfully accessed repository:', {
        id: repo.id,
        name: repo.name,
        project: repo.project?.name,
        defaultBranch: repo.defaultBranch
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error accessing repository';
      console.error('Error accessing repository:', error);
      throw new Error(`Cannot access repository. Check permissions and repository ID. Details: ${errorMessage}`);
    }

    // Now try to get pull requests with different statuses to debug
    const searchCriteria = {
      status: PullRequestStatus.Active,
      repositoryId: repositoryId,
      creatorId: userId
    };

    console.debug('Fetching pull requests with criteria:', {
      ...searchCriteria,
      userId: userId
    });

    const pullRequests = await gitApi.getPullRequests(
      repositoryId,
      searchCriteria,
      project,
      1,  // Always fetch just one PR
      0
    );

    console.debug('Raw pull requests response:', pullRequests);

    if (!pullRequests || pullRequests.length === 0) {
      console.debug('No pull requests found. Trying without creator filter...');
      // Try without creator filter as a test
      const unfilteredPRs = await gitApi.getPullRequests(
        repositoryId,
        {
          status: PullRequestStatus.All,
          repositoryId: repositoryId
        },
        project
      );
      console.debug('Unfiltered pull requests count:', unfilteredPRs?.length || 0);
      if (unfilteredPRs?.length > 0) {
        console.debug('Available creators:', unfilteredPRs.map(pr => ({
          id: pr.createdBy?.id,
          name: pr.createdBy?.displayName
        })));
      }
    }

    // console.debug('Retrieved pull requests:', {
    //   count: pullRequests.length,
    //   requests: pullRequests.map(pr => ({
    //     id: pr.pullRequestId,
    //     title: pr.title,
    //     status: pr.status,
    //     createdBy: pr.createdBy?.displayName,
    //     creatorId: pr.createdBy?.id,
    //     sourceRef: pr.sourceRefName,
    //     targetRef: pr.targetRefName
    //   }))
    // });

    return pullRequests.length > 0
      ? {
          pullRequestId: pullRequests[0].pullRequestId || 0,
          title: pullRequests[0].title || 'Untitled Pull Request',
          description: pullRequests[0].description || '',
          status: pullRequests[0].status || PullRequestStatus.NotSet,
          createdBy: pullRequests[0].createdBy?.displayName || 'Unknown',
          creationDate: new Date(pullRequests[0].creationDate || Date.now()),
          repository: pullRequests[0].repository?.name || 'Unknown',
          sourceRef: pullRequests[0].sourceRefName || '',
          targetRef: pullRequests[0].targetRefName || '',
          url: pullRequests[0]._links?.web?.href || '',
        }
      : null;
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

export async function reviewPullRequest(pullRequestId?: number): Promise<CodeReviewResult> {
  try {
    // If no PR ID provided, get the latest PR
    let prToReview: PullRequestDetails | null = null;
    if (!pullRequestId) {
      prToReview = await getLatestPullRequests();
      if (!prToReview) {
        throw new Error('No pull request found to review');
      }
      pullRequestId = prToReview.pullRequestId;
    }

    const { client } = await getAdoClient();
    const gitApi = await client.getGitApi();
    const project = process.env.ADO_PROJECT;
    const repositoryId = '1b255d6e-1545-42ab-9e75-1fb3f0202dfa';

    if (!project) {
      throw new Error('ADO Project is not configured');
    }

    // Get the pull request details
    const pr = await gitApi.getPullRequestById(pullRequestId, project);
    if (!pr) {
      throw new Error(`Pull request ${pullRequestId} not found`);
    }

    // Get the changes in the pull request
    const changes = await gitApi.getPullRequestIterationChanges(
      repositoryId,
      pullRequestId,
      1,  // Get changes from the first iteration
      project
    );

    // Get the commits in the pull request
    const commits = await gitApi.getPullRequestCommits(
      repositoryId,
      pullRequestId,
      project
    );

    // Analyze the changes
    const statistics = {
      filesChanged: changes.changeEntries?.length || 0,
      additions: 0,
      deletions: 0,
      totalChanges: 0,
    };

    const suggestions: CodeReviewResult['suggestions'] = [];

    // Analyze each changed file
    if (changes.changeEntries) {
      for (const change of changes.changeEntries) {
        const filePath = change.item?.path;
        // Get the file content
        if (filePath && change.item) {
          try {
            const fileContent = await gitApi.getItemContent(
              repositoryId,
              filePath,
              project,
              undefined,
              undefined,
              true
            );

            // Analyze file content for potential issues
            if (fileContent) {
              const content = fileContent.toString();
              if (content.includes('TODO') || content.includes('FIXME')) {
                suggestions.push({
                  file: filePath,
                  message: 'Contains TODO or FIXME comments that should be addressed',
                  severity: 'medium'
                });
              }

              // Add file-specific suggestions
              if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                // TypeScript specific checks
                suggestions.push({
                  file: filePath,
                  message: 'Consider adding type annotations for better code maintainability',
                  severity: 'low'
                });

                // Check for long functions
                const functionMatches = content.match(/function\s+\w+\s*\([^)]*\)\s*{([^}]*)}/g) || [];
                functionMatches.forEach((func: string) => {
                  const lines = func.split('\n').length;
                  if (lines > 30) {
                    suggestions.push({
                      file: filePath,
                      message: 'Function is too long (over 30 lines). Consider breaking it down into smaller functions.',
                      severity: 'medium'
                    });
                  }
                });

                // Check for console.log statements
                if (content.match(/console\.log\(/)) {
                  suggestions.push({
                    file: filePath,
                    message: 'Contains console.log statements. Consider removing them before merging.',
                    severity: 'low'
                  });
                }

                // Check for magic numbers
                const magicNumberRegex = /(?<!\/\/[^\n]*)\b\d+\b(?!\s*[x×]|\s*\.|px|em|rem|%|s|ms|deg|vh|vw)/g;
                if (content.match(magicNumberRegex)) {
                  suggestions.push({
                    file: filePath,
                    message: 'Contains magic numbers. Consider using named constants.',
                    severity: 'low'
                  });
                }

                // Check for commented out code
                if (content.match(/\/\/\s*[a-zA-Z0-9]+.*\([^\n]*\)/)) {
                  suggestions.push({
                    file: filePath,
                    message: 'Contains commented out code. Consider removing it.',
                    severity: 'low'
                  });
                }
              }

              // Check for large files
              if (content.split('\n').length > 300) {
                suggestions.push({
                  file: filePath,
                  message: 'File is too large (over 300 lines). Consider splitting it into smaller modules.',
                  severity: 'medium'
                });
              }

              // Track changes
              if (change.changeType === 2) { // Edit
                const lineCount = content.split('\n').length;
                statistics.additions += lineCount;
                // We'll estimate deletions based on the change type
                statistics.deletions += Math.floor(lineCount * 0.3);
              }
            }
          } catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
          }
        }
      }
    }

    statistics.totalChanges = statistics.additions + statistics.deletions;

    // Analyze commit messages
    const hasGoodCommitMessages = commits.every(commit => 
      commit.comment && 
      commit.comment.length > 10 && 
      !commit.comment.toLowerCase().includes('wip')
    );

    // Check branch naming
    const sourceBranch = pr.sourceRefName?.replace('refs/heads/', '') || '';
    const hasGoodBranchNaming = /^(feature|bugfix|hotfix|release)\/[a-z0-9-]+$/.test(sourceBranch);

    // Check if tests are included
    const hasTests = changes.changeEntries?.some(change => 
      change.item?.path?.includes('test') || 
      change.item?.path?.includes('spec')
    ) || false;

    // Check if documentation is updated
    const hasDocUpdates = changes.changeEntries?.some(change =>
      change.item?.path?.includes('README') ||
      change.item?.path?.includes('docs/') ||
      change.item?.path?.endsWith('.md')
    ) || false;

    return {
      summary: `Review of PR #${pullRequestId}: ${pr.title}`,
      suggestions,
      statistics,
      bestPractices: {
        commitMessages: hasGoodCommitMessages,
        branchNaming: hasGoodBranchNaming,
        testCoverage: hasTests,
        documentationUpdated: hasDocUpdates
      }
    };
  } catch (error) {
    console.error('Error in reviewPullRequest:', error);
    throw error;
  }
} 