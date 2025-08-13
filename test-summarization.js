const toolService = require("./src/services/toolService");

async function testApiSummarization() {
  console.log("Testing API result summarization...");

  // Mock a large weather API response
  const largeApiResult = {
    endpoint_name: "get_weather",
    url: "https://api.openweathermap.org/data/2.5/weather?q=London&units=metric&appid=test-key",
    method: "GET",
    status_code: 200,
    status_text: "OK",
    success: true,
    headers: {
      "content-type": "application/json",
      date: "Tue, 12 Aug 2025 17:10:05 GMT",
    },
    data: {
      coord: { lon: -0.1257, lat: 51.5085 },
      weather: [
        {
          id: 800,
          main: "Clear",
          description: "clear sky",
          icon: "01d",
        },
      ],
      base: "stations",
      main: {
        temp: 25.32,
        feels_like: 25.46,
        temp_min: 23.89,
        temp_max: 27.22,
        pressure: 1013,
        humidity: 60,
        sea_level: 1013,
        grnd_level: 1009,
      },
      visibility: 10000,
      wind: {
        speed: 3.6,
        deg: 240,
        gust: 5.2,
      },
      clouds: {
        all: 0,
      },
      dt: 1692042000,
      sys: {
        type: 2,
        id: 2005430,
        country: "GB",
        sunrise: 1692000123,
        sunset: 1692049876,
      },
      timezone: 3600,
      id: 2643743,
      name: "London",
      cod: 200,
    },
    execution_time_ms: 195,
  };

  const parameters = {
    endpoint_name: "get_weather",
  };

  const summaryConfig = {
    enabled: true,
    model: "gpt-3.5-turbo",
    max_tokens: 100,
    min_size: 500,
    focus: "current temperature, weather condition, wind, humidity",
    endpoint_rules: {
      get_weather: {
        max_tokens: 80,
        focus: "temperature, weather condition, wind speed",
      },
    },
  };

  try {
    console.log(
      "Original result size:",
      JSON.stringify(largeApiResult).length,
      "characters"
    );

    const summarized = await toolService.maybeSummarizeApiResult(
      largeApiResult,
      parameters,
      summaryConfig
    );

    console.log("Summarized result:");
    console.log(JSON.stringify(summarized, null, 2));

    const summarizedSize = JSON.stringify(summarized).length;
    const originalSize = JSON.stringify(largeApiResult).length;
    const savings = (
      ((originalSize - summarizedSize) / originalSize) *
      100
    ).toFixed(1);

    console.log(
      `\nToken savings: ${originalSize} → ${summarizedSize} chars (${savings}% reduction)`
    );
  } catch (error) {
    console.error("Test failed:", error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testApiSummarization();
