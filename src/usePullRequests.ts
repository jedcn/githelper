import { useState, useEffect } from 'react';
import { ApolloClient, useApolloClient } from '@apollo/client';
import { loader } from 'graphql.macro';
import { SearchResultItemEdge, PullRequest } from './generated/types';
import { buildGithubIssueQueryString } from './buildGithubIssueQueryString';
import { transformPullRequest } from './cycle-time/transformPullRequest';
import { PullRequestKeyMetrics } from './types';

const PULL_REQUEST_SEARCH = loader('./queries/pr-query.graphql');

type UsePullRequestParams = {
  authors?: string[];
  reviewedBy?: string[];
  excludeAuthors?: string[];
  from: Date;
  to: Date;
};

type UsePullRequestsReturnType = {
  loading: boolean;
  pullRequests: PullRequestKeyMetrics[];
};

async function queryPagedResults(
  client: ApolloClient<object>,
  queryString: string
) {
  let hasNextPage = true;
  let cursor = null;
  let results: PullRequestKeyMetrics[] = [];

  while (hasNextPage) {
    const { data } = await client.query({
      query: PULL_REQUEST_SEARCH,
      variables: {
        pageSize: 100,
        query: queryString,
        cursor,
      },
    });

    const {
      search: { edges, pageInfo },
    } = data as any;

    const transformedPullrequests = edges.map(
      ({ node }: SearchResultItemEdge) => {
        return transformPullRequest(node as PullRequest);
      }
    );

    results = results.concat(transformedPullrequests);
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  return results;
}

export function usePullRequests({
  authors,
  from,
  to,
  reviewedBy,
  excludeAuthors,
}: UsePullRequestParams): UsePullRequestsReturnType {
  const client = useApolloClient();
  const [loading, setLoading] = useState(true);
  const [pullRequests, setPullRequests] = useState<PullRequestKeyMetrics[]>([]);

  useEffect(() => {
    (async function () {
      setLoading(true);

      let results: PullRequestKeyMetrics[] = [];

      results = await queryPagedResults(
        client,
        buildGithubIssueQueryString({
          authors,
          from,
          to,
          reviewedBy,
          excludeAuthors,
          is: ['PR'],
          useCreatedBeforeRangeVariant: false,
        })
      );

      results = results.concat(
        await queryPagedResults(
          client,
          buildGithubIssueQueryString({
            authors,
            from,
            to,
            reviewedBy,
            excludeAuthors,
            is: ['PR'],
            useCreatedBeforeRangeVariant: true,
          })
        )
      );

      setPullRequests(results);
      setLoading(false);
    })();
  }, [authors, from, to, client, reviewedBy, excludeAuthors]);

  return {
    loading,
    pullRequests,
  };
}
