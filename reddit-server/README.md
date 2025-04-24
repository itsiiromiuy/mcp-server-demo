# Reddit AI/LLM News MCP Service

A Model Context Protocol (MCP) service that retrieves AI and LLM related news from Reddit.

## Features

- Search AI/LLM related content across multiple subreddits
- Configurable time range and result limits
- Built using MCP (Model Context Protocol)
- Rate limiting and error handling
- Easy to integrate with other services

## Prerequisites

- Node.js 18 or higher
- Reddit API credentials (Client ID and Client Secret)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd reddit-ai-news
```

2. Install dependencies:

```bash
npm install
```

3. Copy the environment file and fill in your Reddit API credentials:

```bash
cp .env.example .env
```

4. Edit `.env` and add your Reddit API credentials:

```
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
```

## Building and Running

1. Build the project:

```bash
npm run build
```

2. Start the server:

```bash
npm start
```

The server will start on port 3000 by default (configurable via PORT environment variable).

## API Usage

The service exposes an MCP endpoint at `/mcp` that accepts the following parameters:

```typescript
{
  query: string;              // Search query
  timeRange?: string;         // 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
  limit?: number;             // Number of results (1-25)
  subreddits?: string[];     // List of subreddits to search
}
```

Example request:

```typescript
const response = await fetch("http://localhost:3000/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    function: "searchAINews",
    parameters: {
      query: "GPT-4",
      timeRange: "week",
      limit: 5,
      subreddits: ["artificial", "MachineLearning", "GPT3"],
    },
  }),
});

const data = await response.json();
```

Example response:

```json
{
  "success": true,
  "data": [
    {
      "title": "Example AI News Title",
      "url": "https://reddit.com/...",
      "created": "2024-04-05T00:00:00.000Z",
      "author": "username",
      "subreddit": "artificial",
      "score": 100,
      "num_comments": 50,
      "selftext": "Post content..."
    }
    // ... more results
  ]
}
```

## Error Handling

The API returns error responses in the following format:

```json
{
  "success": false,
  "error": "Error message description"
}
```

## Health Check

A health check endpoint is available at `/health` that returns:

```json
{
  "status": "ok"
}
```

## Development

For development with auto-reloading:

```bash
npm run dev
```

## License

ISC
