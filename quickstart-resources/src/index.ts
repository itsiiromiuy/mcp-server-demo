import {
  McpServer,
  ResourceTemplate
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type WeatherData = {
  temperature: number;
  humidity: number;
  condition: string;
  windSpeed: number;
};

type WeatherDatabase = {
  [city: string]: WeatherData;
};

const mockWeatherData: WeatherDatabase = {
  tokyo: {
    temperature: 20,
    humidity: 65,
    condition: "sunny",
    windSpeed: 10
  },
  osaka: {
    temperature: 22,
    humidity: 70,
    condition: "cloudy",
    windSpeed: 8
  },
  kyoto: {
    temperature: 19,
    humidity: 75,
    condition: "rainy",
    windSpeed: 12
  }
};

const server = new McpServer({
  name: "weather-server",
  version: "1.0.0"
});

server.resource(
  "weather",
  new ResourceTemplate("weather://{city}", { list: undefined }),
  async (uri, { city }) => {
    const cityLower = (typeof city === "string" ? city : city[0]).toLowerCase();
    const cityData = mockWeatherData[cityLower];
    if (!cityData) {
      throw new Error(`Weather data not found for city: ${city}`);
    }
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(cityData, null, 2)
        }
      ]
    };
  }
);

server.tool("getWeather", { city: z.string() }, async ({ city }) => {
  const cityData = mockWeatherData[city.toLowerCase()];
  if (!cityData) {
    return {
      content: [
        {
          type: "text",
          text: `Weather data not found for city: ${city}`
        }
      ],
      isError: true
    };
  }
  return {
    content: [
      {
        type: "text",
        text: `Current weather in ${city}:\nTemperature: ${cityData.temperature}°C\nHumidity: ${cityData.humidity}%\nCondition: ${cityData.condition}\nWind Speed: ${cityData.windSpeed} km/h`
      }
    ]
  };
});

server.prompt("weatherPrompt", { city: z.string() }, ({ city }) => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: `Please provide the weather information for ${city}.`
      }
    }
  ]
}));

const transport = new StdioServerTransport();
await server.connect(transport);
