import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type DifyConfig = {
  apiKey: string;
  apiEndpoint: string;
};

const difyConfig: DifyConfig = {
  apiKey: "app-VLADlgfsmgFNppmlDUMoY22U",
  apiEndpoint: "https://api.dify.ai/v1",
};

const server = new McpServer({
  name: "dify-langgpt-server",
  version: "1.0.0",
});

server.tool(
  "generate-langgpt-prompt",
  "Using Dify to generate prompt templates in LangGPT format",
  {
    message: z
      .string()
      .describe(
        "Description of the original prompt that needs to be converted to LangGPT format"
      ),
  },
  async ({ message }) => {
    try {
      const response = await fetch(`${difyConfig.apiEndpoint}/chat-messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${difyConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {},
          query: message,
          user: "user",
          stream: false,
          conversation_id: null,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} ${response.statusText} ${response.body}`
        );
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: data.answer,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      return {
        content: [
          {
            type: "text",
            text: `An error occurred while calling the Dify API: ${errorMessage}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("The server is up.");
}

main().catch((error) => {
  console.error("Server startup failure:", error);
  process.exit(1);
});
