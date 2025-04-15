'use server';

import * as azdev from 'azure-devops-node-api';
import { PullRequestStatus, GitPullRequest, GitItem, GitCommitRef } from 'azure-devops-node-api/interfaces/GitInterfaces';

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
  isAuthenticatedUserPR: boolean;
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

export async function getLatestPullRequests(specificPrId?: number): Promise<PullRequestDetails | null> {
  try {
    console.debug('Fetching pull request', { specificPrId });

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
    const searchCriteria = specificPrId
      ? { pullRequestId: specificPrId }
      : {
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
      console.debug('No pull requests found');
      return null;
    }

    const pr = pullRequests[0];
    return {
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
      isAuthenticatedUserPR: pr.createdBy?.id === userId
    };
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

export async function reviewPullRequest(pullRequestId: number | undefined = undefined): Promise<CodeReviewResult> {
  try {
    // If no PR ID provided, get the latest PR
    let prToReview: PullRequestDetails | null = null;
    if (pullRequestId === undefined) {
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

    // Get all iterations to analyze the complete change history
    const iterations = await gitApi.getPullRequestIterations(repositoryId, pullRequestId, project);
    const latestIteration = iterations[iterations.length - 1];
    
    if (!latestIteration || latestIteration.id === undefined) {
      throw new Error('Could not determine the latest iteration of the pull request');
    }

    // Get the changes in the pull request for the latest iteration
    const changes = await gitApi.getPullRequestIterationChanges(
      repositoryId,
      pullRequestId,
      latestIteration.id,
      project
    );

    // Get the commits in the pull request
    const commits = await gitApi.getPullRequestCommits(
      repositoryId,
      pullRequestId,
      project
    );

    // Initialize statistics
    const statistics = {
      filesChanged: changes.changeEntries?.length || 0,
      additions: 0,
      deletions: 0,
      totalChanges: 0,
    };

    const suggestions: CodeReviewResult['suggestions'] = [];
    const securityIssues: Set<string> = new Set();
    const performanceIssues: Set<string> = new Set();

    // Analyze each changed file
    if (changes.changeEntries) {
      for (const change of changes.changeEntries) {
        const filePath = change.item?.path;
        
        if (filePath && change.item) {
          try {
            // Get both old and new versions of the file for diff analysis
            const newContent = await gitApi.getItemContent(
              repositoryId,
              filePath,
              project,
              undefined,
              undefined,
              true
            );

            let oldContent: Buffer | undefined;
            const previousVersion = (change.item as GitItem & { previousVersionBase?: string }).previousVersionBase;
            if (previousVersion) {
              try {
                const oldContentStream = await gitApi.getItemContent(
                  repositoryId,
                  filePath,
                  project,
                  undefined,
                  undefined,
                  true
                );
                if (oldContentStream instanceof Buffer) {
                  oldContent = oldContentStream;
                } else if (oldContentStream instanceof Uint8Array) {
                  oldContent = Buffer.from(oldContentStream);
                }
              } catch (error) {
                console.warn(`Could not fetch previous version of ${filePath}:`, error);
              }
            }

            if (newContent) {
              const content = newContent.toString();
              const oldContentStr = oldContent?.toString() || '';

              // Track changes
              const newLines = content.split('\n');
              statistics.additions += newLines.length;
              if (oldContent) {
                const oldLines = oldContentStr.split('\n');
                statistics.deletions += Math.max(0, oldLines.length - newLines.length);
              }

              // Analyze file content based on file type
              if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
                // TypeScript/JavaScript specific checks
                
                // 1. Code Complexity Checks
                const complexityIssues = analyzeCodeComplexity(content);
                suggestions.push(...complexityIssues.map(issue => ({
                  file: filePath,
                  ...issue
                })));

                // 2. Security Checks
                checkSecurityIssues(content, filePath, securityIssues);

                // 3. Performance Checks
                checkPerformanceIssues(content, filePath, performanceIssues);

                // 4. Code Style and Best Practices
                const styleIssues = analyzeCodeStyle(content);
                suggestions.push(...styleIssues.map(issue => ({
                  file: filePath,
                  ...issue
                })));

                // 5. React-specific checks if applicable
                if (filePath.endsWith('.tsx')) {
                  const reactIssues = analyzeReactCode(content);
                  suggestions.push(...reactIssues.map(issue => ({
                    file: filePath,
                    ...issue
                  })));
                }

                // 6. Diff Analysis
                if (oldContentStr) {
                  const diffIssues = analyzeDiff(oldContentStr, content);
                  suggestions.push(...diffIssues.map(issue => ({
                    file: filePath,
                    ...issue
                  })));
                }
              }

              // Check for test coverage
              if (filePath.includes('src/') && !filePath.includes('.test.') && !filePath.includes('.spec.')) {
                const hasCorrespondingTest = changes.changeEntries.some(entry => 
                  entry.item?.path?.includes(filePath.replace('src/', 'test/')) ||
                  entry.item?.path?.includes(filePath.replace('.ts', '.test.ts')) ||
                  entry.item?.path?.includes(filePath.replace('.tsx', '.test.tsx'))
                );

                if (!hasCorrespondingTest) {
                  suggestions.push({
                    file: filePath,
                    message: 'No corresponding test file found for this changed file',
                    severity: 'high'
                  });
                }
              }
            }
          } catch (error) {
            console.error(`Error analyzing file ${filePath}:`, error);
          }
        }
      }
    }

    statistics.totalChanges = statistics.additions + statistics.deletions;

    // Add security and performance issues to suggestions
    securityIssues.forEach(issue => {
      suggestions.push({
        file: 'multiple files',
        message: issue,
        severity: 'high'
      });
    });

    performanceIssues.forEach(issue => {
      suggestions.push({
        file: 'multiple files',
        message: issue,
        severity: 'medium'
      });
    });

    // Analyze commit messages
    const hasGoodCommitMessages = analyzeCommitMessages(commits);

    // Check branch naming
    const sourceBranch = pr.sourceRefName?.replace('refs/heads/', '') || '';
    const branchNamingAnalysis = analyzeBranchNaming(sourceBranch);

    // Check documentation updates
    const docAnalysis = analyzeDocumentation(changes.changeEntries || []);

    return {
      summary: generatePRSummary(pr, statistics, suggestions),
      suggestions: suggestions.sort((a, b) => 
        severityScore(b.severity) - severityScore(a.severity)
      ),
      statistics,
      bestPractices: {
        commitMessages: hasGoodCommitMessages,
        branchNaming: branchNamingAnalysis.isValid,
        testCoverage: !suggestions.some(s => s.message.includes('No corresponding test')),
        documentationUpdated: docAnalysis.hasUpdates
      }
    };
  } catch (error) {
    console.error('Error in reviewPullRequest:', error);
    throw error;
  }
}

// Helper functions for code analysis
function analyzeCodeComplexity(content: string) {
  const issues: Array<{ message: string; severity: 'high' | 'medium' | 'low' }> = [];
  
  // Check cyclomatic complexity
  const functionMatches = content.match(/function\s+\w+\s*\([^)]*\)\s*{([^}]*)}/g) || [];
  functionMatches.forEach((func: string) => {
    const complexity = (func.match(/if|while|for|&&|\|\||switch|catch/g) || []).length;
    if (complexity > 10) {
      issues.push({
        message: `High cyclomatic complexity (${complexity}). Consider breaking down the function.`,
        severity: 'high'
      });
    }
  });

  // Check for nested callbacks/promises
  const nestingLevel = (content.match(/\.then\(|\bcallback\(|\basync\s+/g) || []).length;
  if (nestingLevel > 3) {
    issues.push({
      message: 'Deep nesting of async operations detected. Consider using async/await or breaking down the chain.',
      severity: 'medium'
    });
  }

  return issues;
}

function checkSecurityIssues(content: string, filePath: string, issues: Set<string>) {
  // Check for common security issues
  if (content.includes('eval(')) {
    issues.add('Usage of eval() detected - potential security risk');
  }

  if (content.match(/innerHTML\s*=/)) {
    issues.add('Direct innerHTML manipulation detected - XSS risk');
  }

  if (content.match(/process\.env\.[A-Z_]+/g)) {
    const envVars = content.match(/process\.env\.([A-Z_]+)/g) || [];
    envVars.forEach(envVar => {
      if (envVar.includes('KEY') || envVar.includes('SECRET') || envVar.includes('PASSWORD')) {
        issues.add(`Sensitive environment variable ${envVar} might be exposed`);
      }
    });
  }
}

function checkPerformanceIssues(content: string, filePath: string, issues: Set<string>) {
  // Check for performance anti-patterns
  if (content.includes('Array.prototype') || content.includes('Object.prototype')) {
    issues.add('Prototype modification detected - can cause performance issues');
  }

  const hasManyLoops = (content.match(/for\s*\(|while\s*\(|forEach|map|filter|reduce/g) || []).length > 5;
  if (hasManyLoops) {
    issues.add('Multiple nested loops or array operations detected - potential performance bottleneck');
  }

  if (content.includes('document.querySelectorAll')) {
    issues.add('Consider using more specific selectors or caching DOM queries');
  }
}

function analyzeCodeStyle(content: string) {
  const issues: Array<{ message: string; severity: 'high' | 'medium' | 'low' }> = [];

  // Check naming conventions
  const badVariableNames = content.match(/\b[a-z_]{1,2}\b(?!\s*:)/g);
  if (badVariableNames) {
    issues.push({
      message: 'Found variables with unclear names. Consider using more descriptive names.',
      severity: 'medium'
    });
  }

  // Check for consistent code style
  if (content.includes('var ')) {
    issues.push({
      message: 'Use of var detected. Prefer const or let for better scoping.',
      severity: 'medium'
    });
  }

  return issues;
}

function analyzeReactCode(content: string) {
  const issues: Array<{ message: string; severity: 'high' | 'medium' | 'low' }> = [];

  // Check for React hooks rules
  if (content.includes('useState') || content.includes('useEffect')) {
    const hookCalls = content.match(/use[A-Z]\w+/g) || [];
    if (hookCalls.some(hook => hook.match(/use\w+/))) {
      const hasConditionalHooks = content.match(/if\s*\(.*\)\s*{[^}]*use[A-Z]\w+/);
      if (hasConditionalHooks) {
        issues.push({
          message: 'Hooks should not be called inside conditions',
          severity: 'high'
        });
      }
    }
  }

  // Check for proper dependency arrays
  const effectCalls = content.match(/useEffect\(\s*\(\)\s*=>\s*{[^}]*},\s*\[(.*?)\]/g) || [];
  effectCalls.forEach(effect => {
    if (effect.includes('[]')) {
      issues.push({
        message: 'Empty dependency array in useEffect - verify if this is intended',
        severity: 'medium'
      });
    }
  });

  return issues;
}

function analyzeDiff(oldContent: string, newContent: string) {
  const issues: Array<{ message: string; severity: 'high' | 'medium' | 'low' }> = [];

  // Check for large code blocks being moved without changes
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const movedBlocks = findMovedBlocks(oldLines, newLines);
  
  if (movedBlocks > 3) {
    issues.push({
      message: 'Large blocks of code appear to be moved. Consider extracting into shared functions/components.',
      severity: 'medium'
    });
  }

  return issues;
}

function findMovedBlocks(oldLines: string[], newLines: string[]): number {
  let movedBlocks = 0;
  const minBlockSize = 5;

  for (let i = 0; i < oldLines.length - minBlockSize; i++) {
    const block = oldLines.slice(i, i + minBlockSize).join('\n');
    const newIndex = newLines.join('\n').indexOf(block);
    
    if (newIndex !== -1 && Math.abs(newIndex - i) > minBlockSize) {
      movedBlocks++;
      i += minBlockSize - 1;
    }
  }

  return movedBlocks;
}

function analyzeCommitMessages(commits: GitCommitRef[]): boolean {
  return commits.every(commit => {
    const message = commit.comment || '';
    // Check for conventional commit format
    const hasConventionalFormat = /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{1,50}/.test(message);
    // Check for descriptive message
    const isDescriptive = message.length >= 10 && !message.toLowerCase().includes('wip');
    return hasConventionalFormat && isDescriptive;
  });
}

function analyzeBranchNaming(branchName: string) {
  const conventionalBranchPattern = /^(feature|bugfix|hotfix|release)\/[a-z0-9-]+$/;
  const isValid = conventionalBranchPattern.test(branchName);
  return {
    isValid,
    message: isValid ? 'Branch naming follows conventions' : 'Branch name should follow pattern: type/description'
  };
}

interface GitChangeEntry {
  item?: GitItem;
  changeType?: number;
}

function analyzeDocumentation(changes: GitChangeEntry[]): { hasUpdates: boolean; message: string } {
  const docFiles = changes.filter(change => 
    change.item?.path?.includes('README') ||
    change.item?.path?.includes('docs/') ||
    change.item?.path?.endsWith('.md')
  );

  return {
    hasUpdates: docFiles.length > 0,
    message: docFiles.length > 0 ? 'Documentation has been updated' : 'Consider updating documentation'
  };
}

function severityScore(severity: 'high' | 'medium' | 'low'): number {
  return { high: 3, medium: 2, low: 1 }[severity] || 0;
}

interface AnalysisSummary {
  pr: GitPullRequest;
  statistics: {
    filesChanged: number;
    additions: number;
    deletions: number;
    totalChanges: number;
  };
  suggestions: Array<{
    file: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}

function generatePRSummary(pr: GitPullRequest, statistics: AnalysisSummary['statistics'], suggestions: AnalysisSummary['suggestions']): string {
  const highSeverityCount = suggestions.filter(s => s.severity === 'high').length;
  const mediumSeverityCount = suggestions.filter(s => s.severity === 'medium').length;
  
  return `Review of PR #${pr.pullRequestId}: ${pr.title}\n` +
    `Found ${highSeverityCount} high-severity and ${mediumSeverityCount} medium-severity issues.\n` +
    `Changed ${statistics.filesChanged} files with +${statistics.additions}/-${statistics.deletions} lines.`;
} 