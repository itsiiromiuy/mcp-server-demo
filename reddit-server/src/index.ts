import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Define Reddit post data type
type RedditPost = {
  title: string;
  author: string;
  url: string;
  created_utc: number;
  selftext: string;
  subreddit: string;
  score: number;
};

type RedditSearchResponse = {
  data: {
    children: Array<{
      data: RedditPost;
    }>;
  };
};

// Reddit API client with rate limiting and caching
class RedditClient {
  private baseUrl = "https://www.reddit.com";
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTtlMs = 5 * 60 * 1000; // 5 minutes cache TTL
  private lastRequestTime = 0;
  private minRequestInterval = 1000; // 1 second between requests

  private async throttledRequest(url: string): Promise<any> {
    // Check cache first
    const cacheKey = url;
    const cachedItem = this.cache.get(cacheKey);

    if (cachedItem && Date.now() - cachedItem.timestamp < this.cacheTtlMs) {
      return cachedItem.data;
    }

    // Apply rate limiting
    const now = Date.now();
    const timeToWait = Math.max(
      0,
      this.lastRequestTime + this.minRequestInterval - now
    );

    if (timeToWait > 0) {
      await new Promise((resolve) => setTimeout(resolve, timeToWait));
    }

    // Make the actual request
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 MCP-RedditAINewsBot/1.0",
        },
      });

      // Update cache
      this.cache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now(),
      });

      // Update last request time
      this.lastRequestTime = Date.now();

      return response.data;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Reddit API request failed:", error);
      throw new Error(`Reddit API request failed: ${errorMessage}`);
    }
  }

  async searchPosts(
    query: string,
    subreddits: string[],
    limit: number,
    timeRange: string
  ): Promise<RedditPost[]> {
    // Construct subreddit part of the URL
    const subredditPart =
      subreddits.length > 0
        ? `r/${subreddits.join("+")}`
        : "r/artificial+MachineLearning+LLMs+LocalLLaMA+ChatGPT";

    // Build the search URL
    const searchUrl = `${
      this.baseUrl
    }/${subredditPart}/search.json?q=${encodeURIComponent(
      query
    )}&sort=relevance&t=${timeRange}&limit=${limit * 2}&restrict_sr=on`;

    try {
      const response = (await this.throttledRequest(
        searchUrl
      )) as RedditSearchResponse;

      // Process and filter results
      const posts = response.data.children
        .map((child) => child.data)
        .filter((post) => this.isRelevantPost(post, query))
        .slice(0, limit);

      return posts;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Failed to search Reddit:");

      throw new Error(`Failed to search Reddit: ${errorMessage}`);
    }
  }

  private isRelevantPost(post: RedditPost, query: string): boolean {
    // Simple relevance check - can be improved with NLP techniques
    const queryTerms = query.toLowerCase().split(/\s+/);
    const postText = `${post.title} ${post.selftext}`.toLowerCase();

    // Check if post contains query terms
    return queryTerms.some((term) => postText.includes(term));
  }
}

// Create the MCP server
const server = new McpServer({
  name: "reddit-ai-news-server",
  version: "1.0.0",
});

// Initialize Reddit client
const redditClient = new RedditClient();

// Add Reddit search resource
server.resource(
  "reddit-search",
  new ResourceTemplate("reddit-search://{query}", { list: undefined }),
  async (uri, { query }) => {
    const searchQuery = typeof query === "string" ? query : query[0];

    try {
      const posts = await redditClient.searchPosts(
        searchQuery,
        [], // default subreddits
        5, // default limit
        "month" // default time range
      );

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(posts, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to retrieve Reddit search results: ${errorMessage}`
      );
    }
  }
);

// Add advanced search tool (keeping only this tool as requested)
server.tool(
  "advancedRedditAISearch",
  {
    query: z.string().describe("The AI/LLM topic to search for"),
    filters: z
      .object({
        subreddits: z
          .array(z.string())
          .optional()
          .describe(
            "List of subreddits to search, defaults to AI/LLM related subreddits"
          ),
        timeRange: z
          .enum(["hour", "day", "week", "month", "year", "all"])
          .optional()
          .describe("Time range to search"),
        minScore: z
          .number()
          .optional()
          .describe("Minimum upvote score required"),
        includeKeywords: z
          .array(z.string())
          .optional()
          .describe("Additional keywords that must appear in posts"),
        excludeKeywords: z
          .array(z.string())
          .optional()
          .describe("Keywords that must NOT appear in posts"),
        limit: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe("Maximum number of results to return"),
      })
      .optional(),
  },
  async ({ query, filters = {} }) => {
    try {
      const {
        subreddits = [],
        timeRange = "month",
        minScore = 0,
        includeKeywords = [],
        excludeKeywords = [],
        limit = 5,
      } = filters;

      // Get initial results
      let posts = await redditClient.searchPosts(
        query,
        subreddits,
        10, // Get more posts initially for filtering
        timeRange
      );

      // Apply additional filters
      posts = posts
        .filter((post) => post.score >= minScore)
        .filter((post) => {
          const postText = `${post.title} ${post.selftext}`.toLowerCase();

          // Check required keywords
          const hasRequiredKeywords =
            includeKeywords.length === 0 ||
            includeKeywords.some((keyword) =>
              postText.includes(keyword.toLowerCase())
            );

          // Check excluded keywords
          const hasNoExcludedKeywords =
            excludeKeywords.length === 0 ||
            !excludeKeywords.some((keyword) =>
              postText.includes(keyword.toLowerCase())
            );

          return hasRequiredKeywords && hasNoExcludedKeywords;
        })
        .slice(0, limit); // Limit to specified number

      if (posts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No AI/LLM news found on Reddit matching your advanced search criteria.`,
            },
          ],
        };
      }

      // Format the results
      const formattedResults = posts
        .map((post) => {
          const date = new Date(post.created_utc * 1000).toLocaleDateString();
          const summary = post.selftext
            ? post.selftext.length > 200
              ? post.selftext.substring(0, 200) + "..."
              : post.selftext
            : "No description available";

          return `
## ${post.title}
- **Source**: r/${post.subreddit} by u/${post.author}
- **Date**: ${date}
- **Score**: ${post.score}
- **Summary**: ${summary}
- **Link**: ${post.url}
        `.trim();
        })
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text",
            text: `# Top ${posts.length} AI/LLM Reddit News for "${query}"\n\n${formattedResults}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error performing Reddit search: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Add prompt templates
server.prompt("aiNewsPrompt", { topic: z.string() }, ({ topic }) => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Find me the latest news and discussions about ${topic} in AI and language models on Reddit.`,
      },
    },
  ],
}));

server.prompt(
  "aiTrendsPrompt",
  { timeRange: z.string().optional() },
  ({ timeRange = "month" }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `What are the trending topics in AI and LLMs on Reddit in the past ${timeRange}?`,
        },
      },
    ],
  })
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
